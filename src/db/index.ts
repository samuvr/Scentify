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

/**
 * Cliente unico por proceso.
 *
 * Sin esto, cada consulta abriria su propio pool: en una importacion de CSV de
 * cuarenta filas eso agota las conexiones del servidor. En Vercel cada funcion
 * es un proceso de vida corta, asi que un cliente por proceso es exactamente lo
 * que se quiere.
 */
let cliente: Db | undefined;

export function crearDb(): Db {
  if (cliente) return cliente;

  const nuevo = esNeonHttp()
    ? drizzleNeon(neon(url()), { schema, casing: 'snake_case' })
    : drizzlePostgres(postgres(url(), { max: 5, idle_timeout: 20 }), {
        schema,
        casing: 'snake_case',
      });

  cliente = nuevo as unknown as Db;
  return cliente;
}
/**
 * Ejecuta varias escrituras como una sola transaccion: o entran todas o
 * ninguna.
 *
 * El driver HTTP de Neon no abre transacciones interactivas, pero su `batch`
 * manda las consultas juntas y las ejecuta dentro de una. postgres.js si las
 * abre. Para que las dos ramas valgan, las consultas se construyen con el
 * ejecutor que toque, y por eso llega una funcion y no la lista hecha: una
 * consulta de Drizzle no corre hasta que se espera, asi que construirlas no
 * escribe nada.
 */
export async function enUnaTransaccion(
  construir: (ejecutor: Db) => PromiseLike<unknown>[],
): Promise<void> {
  const db = crearDb();
  if (esNeonHttp()) {
    const consultas = construir(db);
    if (consultas.length === 0) return;
    await (db as unknown as { batch(consultas: unknown[]): Promise<unknown> }).batch(consultas);
    return;
  }
  await db.transaction(async (tx) => {
    for (const consulta of construir(tx as unknown as Db)) await consulta;
  });
}

export { schema };
