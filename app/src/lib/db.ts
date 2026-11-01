import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Pool, type PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  owner: '22222222-2222-4222-8222-222222222222',
  professional: '33333333-3333-4333-8333-333333333333',
  serviceInitial: '44444444-4444-4444-8444-444444444444',
  serviceFollowUp: '55555555-5555-4555-8555-555555555555',
};

export interface PreparedStatement {
  all<T = unknown>(...params: unknown[]): Promise<T[]>;
  get<T = unknown>(...params: unknown[]): Promise<T | undefined>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

export interface DatabaseClient {
  isPostgres: boolean;
  prepare(sql: string): PreparedStatement;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T>;
}

type GlobalWithClients = typeof globalThis & {
  __clinicaDatabase?: DatabaseClient;
  __clinicaPgPool?: Pool;
};

const txStorage = new AsyncLocalStorage<{ client: PoolClient }>();

export function toPgSql(sql: string): string {
  let paramIdx = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      result += char;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
    } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      paramIdx++;
      const rest = sql.slice(i + 1);
      if (/^\s+IS\s+(?:NOT\s+)?NULL/i.test(rest)) {
        result += `$${paramIdx}::text`;
      } else {
        result += `$${paramIdx}`;
      }
    } else {
      result += char;
    }
  }
  return result;
}

function getPgPool(): Pool {
  const globalStore = globalThis as GlobalWithClients;
  if (globalStore.__clinicaPgPool) return globalStore.__clinicaPgPool;

  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não configurada.');

  // Se a conexão apontar para o pooler do Supabase na porta de sessão (5432),
  // reescrevemos automaticamente para a porta de transação (6543) com pooling PgBouncer,
  // evitando o erro (EMAXCONNSESSION) de limite de 15 conexões concorrentes.
  if (connectionString.includes('pooler.supabase.com:5432')) {
    connectionString = connectionString.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  });

  globalStore.__clinicaPgPool = pool;
  return pool;
}

function createPostgresClient(pool: Pool): DatabaseClient {
  const client: DatabaseClient = {
    isPostgres: true,
    prepare(sql: string) {
      const pgSql = toPgSql(sql);
      return {
        async all<T = unknown>(...params: unknown[]): Promise<T[]> {
          const txClient = txStorage.getStore()?.client;
          const res = txClient ? await txClient.query(pgSql, params) : await pool.query(pgSql, params);
          return res.rows as T[];
        },
        async get<T = unknown>(...params: unknown[]): Promise<T | undefined> {
          const txClient = txStorage.getStore()?.client;
          const res = txClient ? await txClient.query(pgSql, params) : await pool.query(pgSql, params);
          return (res.rows[0] ?? undefined) as T | undefined;
        },
        async run(...params: unknown[]): Promise<{ changes: number }> {
          const txClient = txStorage.getStore()?.client;
          const res = txClient ? await txClient.query(pgSql, params) : await pool.query(pgSql, params);
          return { changes: res.rowCount ?? 0 };
        },
      };
    },
    async exec(sql: string): Promise<void> {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed === 'BEGIN IMMEDIATE' || trimmed === 'BEGIN') {
        const existing = txStorage.getStore();
        if (existing?.client) {
          try {
            await existing.client.query('ROLLBACK');
          } catch {}
          try {
            existing.client.release();
          } catch {}
          txStorage.disable();
        }
        const poolClient = await pool.connect();
        try {
          await poolClient.query('BEGIN');
          txStorage.enterWith({ client: poolClient });
        } catch (err) {
          try {
            poolClient.release();
          } catch {}
          throw err;
        }
        return;
      }
      if (trimmed === 'COMMIT') {
        const store = txStorage.getStore();
        if (store?.client) {
          try {
            await store.client.query('COMMIT');
          } finally {
            try {
              store.client.release();
            } catch {}
            txStorage.disable();
          }
        }
        return;
      }
      if (trimmed === 'ROLLBACK') {
        const store = txStorage.getStore();
        if (store?.client) {
          try {
            await store.client.query('ROLLBACK');
          } finally {
            try {
              store.client.release();
            } catch {}
            txStorage.disable();
          }
        }
        return;
      }

      const txClient = txStorage.getStore()?.client;
      if (txClient) {
        await txClient.query(sql);
      } else {
        await pool.query(sql);
      }
    },
    async transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T> {
      const poolClient = await pool.connect();
      try {
        await poolClient.query('BEGIN');
        return await txStorage.run({ client: poolClient }, async () => {
          const res = await fn(client);
          await poolClient.query('COMMIT');
          return res;
        });
      } catch (err) {
        try {
          await poolClient.query('ROLLBACK');
        } catch {}
        throw err;
      } finally {
        try {
          poolClient.release();
        } catch {}
      }
    },
  };

  return client;
}

function databasePath() {
  if (process.env.CLINICA_DATABASE_PATH) return path.resolve(process.env.CLINICA_DATABASE_PATH);
  return path.join(process.cwd(), '.data', 'clinica.sqlite');
}

function createSqliteClient(database: DatabaseSync): DatabaseClient {
  const client: DatabaseClient = {
    isPostgres: false,
    prepare(sql: string) {
      const stmt = database.prepare(sql);
      return {
        async all<T = unknown>(...params: unknown[]): Promise<T[]> {
          return stmt.all(...(params as Array<string | number | bigint | null | undefined>)) as T[];
        },
        async get<T = unknown>(...params: unknown[]): Promise<T | undefined> {
          return (stmt.get(...(params as Array<string | number | bigint | null | undefined>)) ?? undefined) as T | undefined;
        },
        async run(...params: unknown[]): Promise<{ changes: number }> {
          const res = stmt.run(...(params as Array<string | number | bigint | null | undefined>)) as { changes?: number };
          return { changes: res.changes ?? 0 };
        },
      };
    },
    async exec(sql: string): Promise<void> {
      database.exec(sql);
    },
    async transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T> {
      database.exec('BEGIN IMMEDIATE');
      try {
        const res = await fn(client);
        database.exec('COMMIT');
        return res;
      } catch (err) {
        database.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return client;
}

export function getDatabase(): DatabaseClient {
  const globalStore = globalThis as GlobalWithClients;
  if (globalStore.__clinicaDatabase) return globalStore.__clinicaDatabase;

  if (process.env.DATABASE_URL) {
    const pool = getPgPool();
    const pgClient = createPostgresClient(pool);
    globalStore.__clinicaDatabase = pgClient;
    return pgClient;
  }

  const target = databasePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const database = new DatabaseSync(target);
  const sqliteClient = createSqliteClient(database);
  globalStore.__clinicaDatabase = sqliteClient;
  return sqliteClient;
}

export { IDS };
