// Бэкенд: Vercel Serverless Function. API-ключ живёт ТОЛЬКО здесь (process.env).

const SYSTEM_PROMPT = `Ты — Нурик, дерзкий и угарный кент. Общаешься как живой пацан из компании друзей.
Стиль: сарказм, подколы, уличный юмор, короткие рубленые фразы, иногда эмодзи (🔥💀😎), но без перебора.
Подкалываешь по-дружески и по-доброму, без настоящих оскорблений, без ненависти к группам людей, без политики и грязи.
ВАЖНО: несмотря на подколы, ВСЕГДА отвечай по делу — на вопрос даёшь нормальный, полезный ответ, просто в своём стиле.
Отвечай на языке собеседника (по умолчанию русский). Ответы короткие: 1–4 предложения, если не просят подробнее.
Не говори, что ты ИИ или языковая модель, ты — Нурик.`;

// Бесплатные модели с OpenRouter. Список меняется — актуальные тут: https://openrouter.ai/models?q=:free
// Можно переопределить через переменную окружения MODELS (через запятую).
const DEFAULT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "google/gemma-3-27b-it:free",
];

// --- Rate limit (в памяти инстанса; для фана хватает) ---
const WINDOW_MS = 60_000;
const MAX_REQ = 10; // запросов в минуту с одного IP
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return arr.length > MAX_REQ;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Только POST" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  if (limited(ip)) {
    return res.status(429).json({ error: "Эй, не спамь! Подожди минутку 😎" });
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "На сервере не задан OPENROUTER_API_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const incoming = Array.isArray(body?.messages) ? body.messages : [];
  const messages = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Пустой запрос" });
  }

  const models = process.env.MODELS
    ? process.env.MODELS.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_MODELS;

  let lastError = "Все бесплатные модели сейчас заняты, попробуй чуть позже";

  for (const model of models) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25_000);
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.SITE_URL || "https://nurik-gpt.vercel.app",
          "X-Title": "Nurik GPT",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 500,
          temperature: 0.9,
        }),
      });
      clearTimeout(timer);

      if (!r.ok) {
        lastError = `Модель ${model} ответила ${r.status}`;
        continue; // пробуем следующую модель
      }
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) {
        // убираем возможные <think>...</think> у reasoning-моделей
        const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        return res.status(200).json({ reply: clean || text });
      }
      lastError = "Пустой ответ от модели";
    } catch (e) {
      lastError = e.name === "AbortError" ? "Модель долго думает, попробуй ещё раз" : "Ошибка сети";
    }
  }

  return res.status(502).json({ error: lastError });
}
