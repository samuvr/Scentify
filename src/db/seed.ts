/**
 * Semillas por usuario (seccion 11).
 *
 * El vocabulario global —notas y familias— se siembra en la migracion
 * `0001_semillas.sql`. Aqui solo se hace lo que necesita saber quien es el
 * usuario: crearlo si no existe e invocar `sembrar_usuario()`, que inserta los
 * seis contextos y los umbrales de temperatura por defecto.
 *
 * Idempotente: se puede ejecutar tantas veces como se quiera y nunca pisa un
 * umbral que ya se haya cambiado desde la pantalla de configuracion.
 */
import { randomUUID, scryptSync, randomBytes } from 'node:crypto';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}

const userId = process.env.SCENTIFY_USER_ID ?? randomUUID();
// En minusculas: el login normaliza asi el correo antes de buscarlo, y si
// aqui se guardara con mayusculas no habria forma de entrar.
const email = (process.env.SCENTIFY_USER_EMAIL ?? 'yo@scentify.local').trim().toLowerCase();
const password = process.env.SCENTIFY_USER_PASSWORD;

/** scrypt con sal por usuario. Formato: scrypt$<sal hex>$<derivada hex>. */
function hashear(clave: string): string {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString('hex')}$${scryptSync(clave, sal, 64).toString('hex')}`;
}

// '!' no es un hash valido en ningun formato, asi que ninguna clave puede
// coincidir con el: el usuario queda creado pero sin acceso hasta fijar clave.
const passwordHash = password ? hashear(password) : '!';

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [usuario] = await sql`
    insert into usuario (id, email, password_hash)
    values (${userId}, ${email}, ${passwordHash})
    on conflict (email) do update set email = excluded.email
    returning id, email
  `;
  if (!usuario) throw new Error('No se pudo crear ni recuperar el usuario.');

  await sql`select sembrar_usuario(${usuario.id}::uuid)`;

  const [conteos] = await sql<
    { contextos: number; ajustes: number; notas: number; familias: number }[]
  >`
    select
      (select count(*)::int from contexto where user_id = ${usuario.id}) as contextos,
      (select count(*)::int from ajuste   where user_id = ${usuario.id}) as ajustes,
      (select count(*)::int from nota)                                   as notas,
      (select count(*)::int from familia)                                as familias
  `;
  if (!conteos) throw new Error('No se pudieron leer los conteos de semillas.');

  console.log(`Usuario ${usuario.email} (${usuario.id})`);
  console.log(`  contextos: ${conteos.contextos}   ajustes: ${conteos.ajustes}`);
  console.log(`  notas: ${conteos.notas}   familias: ${conteos.familias}`);
  if (!password) {
    console.log('\nSin SCENTIFY_USER_PASSWORD: el usuario queda sin clave utilizable.');
  }
} finally {
  await sql.end();
}
