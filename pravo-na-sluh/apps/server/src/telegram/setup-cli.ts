// npm run bot:setup — регистрирует webhook, команды и кнопку меню Mini App.
// Требуются BOT_TOKEN, PUBLIC_URL (HTTPS) и TELEGRAM_WEBHOOK_SECRET в .env.
import { cliContext } from '../cli.ts';

const { config, bot, database } = await cliContext();
await database.close();
if (!bot.enabled || !config.PUBLIC_URL || !config.TELEGRAM_WEBHOOK_SECRET) {
  console.error('Нужны BOT_TOKEN, PUBLIC_URL и TELEGRAM_WEBHOOK_SECRET — бот не настроен.');
  process.exit(1);
}
const me = await bot.call<{ username: string }>('getMe', {});
await bot.call('setWebhook', {
  url: `${config.PUBLIC_URL.replace(/\/$/, '')}/telegram/webhook`,
  secret_token: config.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'pre_checkout_query'],
  drop_pending_updates: false,
});
await bot.call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Открыть «Право на слух»' },
    { command: 'support', description: 'Помощь и обратная связь' },
    { command: 'paysupport', description: 'Вопросы по оплате' },
    { command: 'terms', description: 'Условия использования' },
  ],
});
await bot.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Слушать', web_app: { url: config.PUBLIC_URL } } });
console.log(`Бот @${me.username} настроен: webhook ${config.PUBLIC_URL}/telegram/webhook, кнопка меню → Mini App`);
