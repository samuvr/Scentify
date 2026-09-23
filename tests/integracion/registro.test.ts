/**
 * Registro con codigo de invitacion y aislamiento entre cuentas, contra
 * PostgreSQL. Se salta solo si no hay `DATABASE_URL`.
 *
 * Mientras la app era de un solo usuario, que una consulta no filtrara por
 * `user_id` no se notaba. Con amigos, cualquier id que llegue del cliente puede
 * ser de otra cuenta, y las claves ajenas solo comprueban que exista.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Fuera de una peticion no hay cookies: se sustituye el almacen por uno en
// memoria para poder ver que el registro deja la sesion abierta.
const galletas = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      galletas.has(nombre) ? { name: nombre, value: galletas.get(nombre)! } : undefined,
    set: (nombre: string, valor: string) => void galletas.set(nombre, valor),
    delete: (nombre: string) => void galletas.delete(nombre),
  }),
}));

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
const CODIGO = 'perfumes-para-todos';

cuando('registro de cuentas nuevas', () => {
  let auth: typeof import('@/servicios/auth');
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  const creados: string[] = [];
  const correo = (quien: string) => `${quien}-${crypto.randomUUID()}@ejemplo.com`;

  async function registrar(email: string, clave = 'una clave larga', codigo = CODIGO) {
    const resultado = await auth.registrarUsuario(email, clave, codigo);
    if (resultado.ok) creados.push(resultado.userId);
    return resultado;
  }

  beforeAll(async () => {
    process.env.SCENTIFY_CODIGO_INVITACION = CODIGO;
    // Firmar la cookie de sesion lo necesita; el `.env` de pruebas puede no tenerlo.
    process.env.AUTH_SECRET ??= 'secreto-de-pruebas';
    auth = await import('@/servicios/auth');
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    db = (await import('@/db')).crearDb();
  });

  afterAll(async () => {
    delete process.env.SCENTIFY_CODIGO_INVITACION;
    if (creados.length === 0) return;
    // `uso` y `perfume_contexto` apuntan con RESTRICT: se borra de fuera
    // hacia dentro antes de soltar la cuenta.
    await db.delete(esquema.uso).where(orm.inArray(esquema.uso.userId, creados));
    await db.delete(esquema.perfume).where(orm.inArray(esquema.perfume.userId, creados));
    await db.delete(esquema.usuario).where(orm.inArray(esquema.usuario.id, creados));
  });

  it('crea la cuenta con sus contextos y umbrales, y deja la sesión abierta', async () => {
    galletas.clear();
    const email = correo('Ana').toUpperCase();
    const resultado = await registrar(`  ${email}  `);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const [usuario] = await db
      .select()
      .from(esquema.usuario)
      .where(orm.eq(esquema.usuario.id, resultado.userId));
    // En minusculas y sin espacios, que es como lo busca el login.
    expect(usuario?.email).toBe(email.toLowerCase());
    expect(usuario?.passwordHash.startsWith('scrypt$')).toBe(true);

    const contextos = await db
      .select()
      .from(esquema.contexto)
      .where(orm.eq(esquema.contexto.userId, resultado.userId));
    const ajustes = await db
      .select()
      .from(esquema.ajuste)
      .where(orm.eq(esquema.ajuste.userId, resultado.userId));
    expect(contextos).toHaveLength(6);
    expect(ajustes.length).toBeGreaterThanOrEqual(8);

    expect(await auth.usuarioActual()).toBe(resultado.userId);
  });

  it('con la cuenta creada se puede entrar con la misma contraseña', async () => {
    const email = correo('bea');
    await registrar(email, 'la de bea 123');
    galletas.clear();

    expect(await auth.iniciarSesion(email, 'otra')).toBe(false);
    expect(await auth.iniciarSesion(email.toUpperCase(), 'la de bea 123')).toBe(true);
    expect(await auth.usuarioActual()).not.toBeNull();
  });

  it('sin el código correcto no se crea nada', async () => {
    const email = correo('carlos');
    expect(await registrar(email, 'una clave larga', 'adivinado')).toEqual({
      ok: false,
      motivo: 'CODIGO',
    });
    const filas = await db
      .select()
      .from(esquema.usuario)
      .where(orm.eq(esquema.usuario.email, email));
    expect(filas).toHaveLength(0);
  });

  it('un correo que ya tiene cuenta no se pisa', async () => {
    const email = correo('dani');
    await registrar(email, 'primera clave');
    expect(await registrar(email, 'segunda clave')).toEqual({ ok: false, motivo: 'EXISTE' });
    galletas.clear();
    expect(await auth.iniciarSesion(email, 'primera clave')).toBe(true);
  });

  it('sin SCENTIFY_CODIGO_INVITACION el registro está cerrado', async () => {
    const anterior = process.env.SCENTIFY_CODIGO_INVITACION;
    process.env.SCENTIFY_CODIGO_INVITACION = '  ';
    try {
      expect(auth.registroAbierto()).toBe(false);
      // Ni siquiera con un codigo vacio que "coincidiria" con el configurado.
      expect(await registrar(correo('eva'), 'una clave larga', '')).toEqual({
        ok: false,
        motivo: 'CERRADO',
      });
    } finally {
      process.env.SCENTIFY_CODIGO_INVITACION = anterior;
    }
  });

  describe('aislamiento entre cuentas', () => {
    let perfumes: typeof import('@/servicios/perfumes');
    let usos: typeof import('@/servicios/usos');
    let consultas: typeof import('@/servicios/consultas');
    let datos: typeof import('@/servicios/datos');
    let wishlist: typeof import('@/servicios/wishlist');
    let yo: string;
    let otra: string;
    let miContexto: string;
    let suContexto: string;
    let suPerfume: string;

    const perfume = (contextoId: string, nombre: string) => ({
      nombre,
      marca: 'Aislamiento',
      estado: 'LO_TENGO' as const,
      notas: [{ nombre: 'Vetiver', nivel: 'FONDO' as const }],
      familiaIds: [],
      contextoIds: [contextoId],
      estaciones: ['OTONO' as const],
      momentos: ['NOCHE' as const],
    });

    beforeAll(async () => {
      perfumes = await import('@/servicios/perfumes');
      usos = await import('@/servicios/usos');
      consultas = await import('@/servicios/consultas');
      datos = await import('@/servicios/datos');
      wishlist = await import('@/servicios/wishlist');

      const a = await registrar(correo('yo'));
      const b = await registrar(correo('otra'));
      if (!a.ok || !b.ok) throw new Error('No se pudieron crear las cuentas de prueba.');
      yo = a.userId;
      otra = b.userId;
      miContexto = (await consultas.listarContextos(yo))[0]!.id;
      suContexto = (await consultas.listarContextos(otra))[0]!.id;
      suPerfume = await perfumes.crearPerfume(otra, perfume(suContexto, 'El de la otra'));
    });

    it('cada cuenta ve solo su colección', async () => {
      await perfumes.crearPerfume(yo, perfume(miContexto, 'El mío'));
      const mia = await consultas.listarColeccion(yo);
      expect(mia.map((p) => p.nombre)).toEqual(['El mío']);
      expect(await consultas.fichaDePerfume(yo, suPerfume)).toBeNull();
    });

    it('no se puede registrar un uso sobre el perfume de otra cuenta', async () => {
      await expect(
        usos.registrarUso(yo, {
          perfumeId: suPerfume,
          fecha: '2026-09-01',
          momento: 'NOCHE',
          contextoId: miContexto,
          estacionesForzadas: ['OTONO'],
        }),
      ).rejects.toThrow(perfumes.ErrorValidacion);
      // Tampoco la vista previa, que enseñaria sus marcas.
      await expect(
        usos.previsualizarIdoneidad(yo, {
          perfumeId: suPerfume,
          fecha: '2026-09-01',
          momento: 'NOCHE',
          contextoId: miContexto,
          estacionesForzadas: ['OTONO'],
        }),
      ).rejects.toThrow(perfumes.ErrorValidacion);
    });

    it('no se puede usar el contexto de otra cuenta', async () => {
      const mio = await perfumes.crearPerfume(yo, perfume(miContexto, 'Otro mío'));
      await expect(
        usos.registrarUso(yo, {
          perfumeId: mio,
          fecha: '2026-09-02',
          momento: 'NOCHE',
          contextoId: suContexto,
          estacionesForzadas: ['OTONO'],
        }),
      ).rejects.toThrow(perfumes.ErrorValidacion);
      await expect(
        perfumes.crearPerfume(yo, { ...perfume(miContexto, 'Colado'), contextoIds: [suContexto] }),
      ).rejects.toThrow(perfumes.ErrorValidacion);
    });

    it('editar el perfume de otra cuenta no toca sus datos', async () => {
      await expect(
        perfumes.actualizarPerfume(yo, suPerfume, perfume(miContexto, 'Pisado')),
      ).rejects.toThrow(perfumes.ErrorValidacion);
      const ficha = await consultas.fichaDePerfume(otra, suPerfume);
      expect(ficha?.perfume.nombre).toBe('El de la otra');
    });

    it('editar un deseo de otra cuenta no le cambia las notas de fondo', async () => {
      const deseo = await wishlist.crearDeseo(otra, {
        nombre: 'Deseo ajeno',
        marca: 'Aislamiento',
        prioridad: 'LO_QUIERO',
        notasFondo: ['Ámbar'],
      });
      await wishlist.actualizarDeseo(yo, deseo, {
        nombre: 'Pisado',
        marca: 'Aislamiento',
        prioridad: 'LO_QUIERO',
        notasFondo: ['Cuero'],
      });
      expect(await wishlist.notasFondoDeDeseo(deseo)).toEqual(['Ámbar']);
    });

    it('una copia manipulada no mete filas en los perfumes de otra cuenta', async () => {
      const copia = await datos.copiaCompleta(yo);
      // La copia solo lleva lo propio.
      expect(copia.perfumes.every((p) => p.userId === yo)).toBe(true);
      expect(copia.perfumeNota.some((f) => f.perfumeId === suPerfume)).toBe(false);

      const [vetiver] = await db
        .select()
        .from(esquema.nota)
        .where(orm.eq(esquema.nota.nombreNormalizado, 'vetiver'));
      const manipulada = {
        ...copia,
        perfumeNota: [...copia.perfumeNota, { perfumeId: suPerfume, notaId: vetiver!.id, nivel: 'SALIDA' as const, orden: 9 }],
        perfumeEstacion: [...copia.perfumeEstacion, { perfumeId: suPerfume, estacion: 'VERANO' as const }],
        perfumeContexto: [...copia.perfumeContexto, { perfumeId: suPerfume, contextoId: suContexto }],
      };
      await datos.restaurarCopia(yo, manipulada);

      const suyas = await db
        .select()
        .from(esquema.perfumeEstacion)
        .where(orm.eq(esquema.perfumeEstacion.perfumeId, suPerfume));
      expect(suyas.map((f) => f.estacion)).toEqual(['OTONO']);
      const notas = await db
        .select()
        .from(esquema.perfumeNota)
        .where(orm.eq(esquema.perfumeNota.perfumeId, suPerfume));
      expect(notas.map((n) => n.nivel)).toEqual(['FONDO']);

      // Y lo propio vuelve entero.
      const tras = await consultas.listarColeccion(yo);
      expect(tras.map((p) => p.nombre).sort()).toEqual(['El mío', 'Otro mío']);
    });
  });
});
