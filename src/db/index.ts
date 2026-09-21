/**
 * Cliente de base de datos.
 *
 * En Vercel las funciones son sin estado y de vida corta, asi que se usa el
 * driver serverless de Neon sobre HTTP, que no mantiene conexiones abiertas.
 * En local (scripts, tests de integracion) se usa postgres.js contra la misma
 * cadena, que habla TCP normal.
 */
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import * as schema from './schema';

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('Falta DATABASE_URL. Copia .env.example a .env y rellenala.');
  return value;
}

const esNeonHttp = () => /\.neon\.tech/.test(url()) && process.env.SCENTIFY_DB_DRIVER !== 'tcp';

/**
 * Los dos drivers exponen el mismo constructor de consultas; lo unico que
 * difiere es la forma que devuelve `execute()` con SQL en crudo, que aqui no se
 * usa. Se declara un solo tipo para que las firmas no se conviertan en una union
 * y las sobrecargas de Drizzle sigan resolviendo.
 */
export type Db = PostgresJsDatabase<typeof schema>;

export function crearDb(): Db {
  const cliente = esNeonHttp()
    ? drizzleNeon(neon(url()), { schema, casing: 'snake_case' })
    : drizzlePostgres(postgres(url(), { max: 1 }), { schema, casing: 'snake_case' });
  return cliente as unknown as Db;
}
export { schema };
