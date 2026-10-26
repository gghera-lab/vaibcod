// Общая инициализация для консольных команд.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT_DIR } from './config.ts';
import { openDatabase } from './db/client.ts';
import { BotApi, DisabledBot } from './telegram/bot-api.ts';

export async function cliContext() {
  const envFile = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const config = loadConfig();
  const database = await openDatabase(config.DATABASE_URL, config.DATA_DIR);
  const bot = config.BOT_TOKEN ? new BotApi(config.BOT_TOKEN) : new DisabledBot();
  return { config, database, db: database.db, bot };
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
