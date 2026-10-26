// npm run db:seed — загружает каталог, текст Конституции, аудио-манифесты, тарифы и карточки.
import { cliContext } from '../cli.ts';
import { seed } from './seed.ts';

const { database, config } = await cliContext();
await database.migrate();
console.log(await seed(database.db, config));
await database.close();
