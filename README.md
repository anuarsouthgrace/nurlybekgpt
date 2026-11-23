# Нурик ГПТ

Структура:
- `public/index.html` — фронтенд (чат, печатная машинка, звук Undertale через Web Audio)
- `public/nurik.jpg` — аватарка
- `api/chat.js` — бэкенд (прокси к OpenRouter, ключ только в переменных окружения, rate limit 10 запросов/мин на IP)

Деплой на Vercel за 5 минут:
1. Получи бесплатный ключ на https://openrouter.ai/keys (карта не нужна).
2. Залей папку на GitHub (новый репозиторий, `.env` не заливай — он в .gitignore).
3. На https://vercel.com → Add New → Project → выбери репозиторий → в Environment Variables добавь
   `OPENROUTER_API_KEY` = твой ключ → Deploy.
4. Открой выданную ссылку `*.vercel.app` и кинь друзьям.

Локально: `npm i -g vercel`, затем `vercel dev` (положи ключ в `.env`).
