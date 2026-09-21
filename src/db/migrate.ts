/**
 * Aplica las migraciones de `drizzle/` en orden, segun `meta/_journal.json`.
 * Se ejecuta en local y en el build de Vercel: `npm run db:migrate`.
 */
import './entorno';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

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

try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log('Migraciones aplicadas.');
} finally {
  await sql.end();
}
