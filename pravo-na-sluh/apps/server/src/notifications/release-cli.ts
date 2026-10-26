// npm run notify:release -- --document gk-1 — поставить уведомления о выходе аудиоверсии и отправить их.
import { arg, cliContext } from '../cli.ts';
import { processOutbox, queueAudioRelease } from './outbox.ts';

const { db, config, bot, database } = await cliContext();
const documentId = arg('document');
if (!documentId) {
  console.error('Укажите --document <id>');
  process.exit(1);
}
const queued = await queueAudioRelease(db, documentId);
const result = await processOutbox(db, config, bot, 1000);
console.log({ queued, ...result });
await database.close();
