/**
 * Autenticacion contra PostgreSQL. Se salta solo si no hay `DATABASE_URL`.
 *
 * Cubre el desajuste que costo una tarde: el login busca el correo en
 * minusculas y la semilla lo guardaba tal y como viniera de la variable de
 * entorno, asi que un correo con mayusculas dejaba al usuario fuera de su
 * propia app sin ningun mensaje que lo explicara.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;

cuando('autenticación', () => {
  let auth: typeof import('@/servicios/auth');
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');

  beforeAll(async () => {
    auth = await import('@/servicios/auth');
    esquema = await import('@/db/schema');
    db = (await import('@/db')).crearDb();
  });

  it('la contraseña se verifica contra su hash y rechaza la equivocada', () => {
    const hash = auth.hashearPassword('contraseña con ñ y espacios');
    expect(auth.passwordCorrecta('contraseña con ñ y espacios', hash)).toBe(true);
    expect(auth.passwordCorrecta('otra', hash)).toBe(false);
  });

  it('dos hashes de la misma clave son distintos: hay sal por usuario', () => {
    const a = auth.hashearPassword('igual');
    const b = auth.hashearPassword('igual');
    expect(a).not.toBe(b);
    expect(auth.passwordCorrecta('igual', a)).toBe(true);
    expect(auth.passwordCorrecta('igual', b)).toBe(true);
  });

  it('un hash con formato inválido no cuela', () => {
    // '!' es lo que deja la semilla cuando no se le da contraseña.
    expect(auth.passwordCorrecta('lo que sea', '!')).toBe(false);
    expect(auth.passwordCorrecta('lo que sea', '')).toBe(false);
    expect(auth.passwordCorrecta('lo que sea', 'md5$abc$def')).toBe(false);
  });

  it('el correo del usuario sembrado está en minúsculas', async () => {
    const usuarios = await db.select({ email: esquema.usuario.email }).from(esquema.usuario);
    expect(usuarios.length).toBeGreaterThan(0);
    for (const { email } of usuarios) {
      expect(email).toBe(email.toLowerCase());
      expect(email).toBe(email.trim());
    }
  });

  it('el correo se puede escribir con mayúsculas al entrar', async () => {
    const { eq } = await import('drizzle-orm');
    const [usuario] = await db.select().from(esquema.usuario).limit(1);
    expect(usuario).toBeDefined();

    // Lo que hace `iniciarSesion` antes de buscar en la tabla.
    const comoLoEscribeElUsuario = `  ${usuario!.email.toUpperCase()}  `;
    const [encontrado] = await db
      .select()
      .from(esquema.usuario)
      .where(eq(esquema.usuario.email, comoLoEscribeElUsuario.trim().toLowerCase()))
      .limit(1);

    expect(encontrado?.id).toBe(usuario!.id);
  });
});
