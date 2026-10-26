// npm run db:migrate — применяет миграции из apps/server/drizzle.
import { cliContext } from '../cli.ts';

const { database } = await cliContext();
await database.migrate();
console.log(`Миграции применены (${database.kind})`);
await database.close();
