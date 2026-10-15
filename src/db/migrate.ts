/**
 * Aplica las migraciones de `drizzle/` en orden, segun `meta/_journal.json`.
 * Se ejecuta en local con `npm run db:migrate`, y en Vercel dentro del
 * `buildCommand` de vercel.json, de modo que cada despliegue deja la base al
 * dia antes de servir nada. No esta en el script `build` de package.json a
 * proposito: asi compilar en local no exige tener una base de datos.
 */
import './entorno';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { crearRamaDeSeguridad, migracionesPendientes } from './rama-de-seguridad';

/*
 * En Vercel solo migra el despliegue de produccion.
 *
 * Las previews de cada PR tambien pasan por este `buildCommand`, y si comparten
 * `DATABASE_URL` con produccion, migrarian la base real antes de fusionar: una
 * migracion que quita columnas deja rota la version publicada, que sigue con el
 * codigo viejo. Quien tenga una base propia para las previews (una rama de Neon,
 * p. ej. con su integracion con Vercel) lo activa con SCENTIFY_MIGRAR_EN_PREVIEW=1.
 * Fuera de Vercel (en local, en los tests) VERCEL_ENV no existe y se migra siempre.
 */
const entornoVercel = process.env.VERCEL_ENV;
if (
  entornoVercel &&
  entornoVercel !== 'production' &&
  process.env.SCENTIFY_MIGRAR_EN_PREVIEW !== '1'
) {
  console.log(
    `Despliegue de Vercel "${entornoVercel}": no se migra la base.\n` +
      'Si esta preview tiene base propia, define SCENTIFY_MIGRAR_EN_PREVIEW=1 en ese entorno.',
  );
  process.exit(0);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'Falta DATABASE_URL.\n' +
      'Copia .env.example a .env y pon ahi la cadena de conexion de Neon,\n' +
      'o pasala en la misma linea: DATABASE_URL=... npm run db:migrate',
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

/** El `when` de la ultima migracion aplicada, o null en una base sin migrar. */
async function ultimaAplicada(): Promise<number | null> {
  try {
    const [fila] = await sql`select max(created_at) as ultima from drizzle.__drizzle_migrations`;
    return fila?.ultima == null ? null : Number(fila.ultima);
  } catch {
    return null;
  }
}

try {
  const diario = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const ultima = await ultimaAplicada();
  const pendientes = migracionesPendientes(diario.entries, ultima);
  // Una base nueva no tiene nada que guardar.
  if (pendientes.length > 0 && ultima !== null) await crearRamaDeSeguridad(pendientes);

  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log('Migraciones aplicadas.');
} finally {
  await sql.end();
}
