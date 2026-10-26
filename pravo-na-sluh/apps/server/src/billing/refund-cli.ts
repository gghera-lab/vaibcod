// npm run billing:refund -- --payment <id> — возврат платежа в Stars (refundStarPayment) и отзыв доступа.
import { arg, cliContext } from '../cli.ts';
import { refundPayment } from './service.ts';

const { db, config, bot, database } = await cliContext();
const id = Number(arg('payment'));
if (!Number.isInteger(id)) {
  console.error('Укажите --payment <id>');
  process.exit(1);
}
console.log(await refundPayment({ db, config, bot }, id, 'admin:cli'));
await database.close();
