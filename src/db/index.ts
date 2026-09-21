/**
 * Cliente de base de datos.
 *
 * En Vercel las funciones son sin estado y de vida corta, asi que se usa el
 * driver serverless de Neon sobre HTTP, que no mantiene conexiones abiertas.
 * En local (scripts, tests de integracion) se usa postgres.js contra la misma
 * cadena, que habla TCP normal.
 */
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import * as schema from './schema';

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('Falta DATABASE_URL. Copia .env.example a .env y rellenala.');
  return value;
}

const esNeonHttp = () => /\.neon\.tech/.test(url()) && process.env.SCENTIFY_DB_DRIVER !== 'tcp';

export function crearDb() {
  return esNeonHttp()
    ? drizzleNeon(neon(url()), { schema, casing: 'snake_case' })
    : drizzlePostgres(postgres(url(), { max: 1 }), { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof crearDb>;
export { schema };
