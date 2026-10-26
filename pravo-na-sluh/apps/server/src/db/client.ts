// Подключение к БД: PostgreSQL (production) или встроенный PGlite (разработка, тесты, демо).

import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema.ts';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: DB;
  kind: 'postgres' | 'pglite';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS = path.resolve(import.meta.dirname, '../../drizzle');

/** url: строка подключения PostgreSQL; 'memory' — PGlite в памяти; undefined — PGlite в dataDir. */
export async function openDatabase(url: string | undefined, dataDir: string): Promise<Database> {
  if (url && url !== 'memory') {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzlePg(pool, { schema }) as unknown as DB;
    return {
      db,
      kind: 'postgres',
      migrate: () => migratePg(db as never, { migrationsFolder: MIGRATIONS }),
      close: () => pool.end(),
    };
  }
  let client: PGlite;
  if (url === 'memory') client = new PGlite();
  else {
    const dir = path.join(dataDir, 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as DB;
  return {
    db,
    kind: 'pglite',
    migrate: () => migratePglite(db as never, { migrationsFolder: MIGRATIONS }),
    close: () => client.close(),
  };
}
