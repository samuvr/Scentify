/**
 * La copia de seguridad cierra el circulo de verdad: sale como JSON, se lee de
 * un fichero y vuelve a entrar. Se salta solo si no hay `DATABASE_URL`.
 *
 * Los demas tests restauran el objeto que devuelve `copiaCompleta` tal cual,
 * con sus `Date` dentro, y eso no es lo que pasa en la app: la pantalla sube
 * un fichero, se hace `JSON.parse` y las fechas llegan como texto. Aqui se
 * pasa por JSON a proposito.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
const CODIGO = 'copias-de-verdad';
const RONDA = crypto.randomUUID().slice(0, 8);

cuando('copia de seguridad en JSON (sección 9)', () => {
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  let datos: typeof import('@/servicios/datos');
  let perfumes: typeof import('@/servicios/perfumes');
  let consultas: typeof import('@/servicios/consultas');
  let wishlist: typeof import('@/servicios/wishlist');
  let ajustes: typeof import('@/servicios/ajustes');
  let yo: string;

  const perfume = (contextoId: string, nombre: string) => ({
    nombre,
    marca: 'Copia',
    estado: 'LO_TENGO' as const,
    notas: [{ nombre: 'Oud', nivel: 'FONDO' as const }],
    familiaIds: [],
    contextoIds: [contextoId],
    estaciones: ['INVIERNO' as const],
    momentos: ['NOCHE' as const],
  });

  beforeAll(async () => {
    process.env.SCENTIFY_CODIGO_INVITACION = CODIGO;
    process.env.AUTH_SECRET ??= 'secreto-de-pruebas';
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    db = (await import('@/db')).crearDb();
    datos = await import('@/servicios/datos');
    perfumes = await import('@/servicios/perfumes');
    consultas = await import('@/servicios/consultas');
    wishlist = await import('@/servicios/wishlist');
    ajustes = await import('@/servicios/ajustes');

    const auth = await import('@/servicios/auth');
    const cuenta = await auth.registrarUsuario(
      `copia-${crypto.randomUUID()}@ejemplo.com`,
      'una clave larga',
      CODIGO,
    );
    if (!cuenta.ok) throw new Error('No se pudo crear la cuenta de pruebas.');
    yo = cuenta.userId;
  });

  afterAll(async () => {
    delete process.env.SCENTIFY_CODIGO_INVITACION;
    if (!yo) return;
    await db.delete(esquema.uso).where(orm.eq(esquema.uso.userId, yo));
    await db.delete(esquema.perfume).where(orm.eq(esquema.perfume.userId, yo));
    await db.delete(esquema.ficha).where(orm.like(esquema.ficha.nombre, `% ${RONDA}`));
    await db.delete(esquema.usuario).where(orm.eq(esquema.usuario.id, yo));
  });

  it('una copia leída de un fichero vuelve entera, ajustes y notas de la wishlist incluidos', async () => {
    const contexto = (await consultas.listarContextos(yo))[0]!.id;
    const perfumeId = await perfumes.crearPerfume(yo, perfume(contexto, `Guardado ${RONDA}`));
    await db.insert(esquema.uso).values({
      userId: yo,
      perfumeId,
      fecha: '2026-01-10',
      momento: 'NOCHE',
      contextoId: contexto,
      idoneidadPct: 100,
      idoneidadDetalle: { momento: true, contexto: true, estacion: true },
      estacionesEfectivas: ['INVIERNO'],
      estacionEfectiva: 'INVIERNO',
    });
    const deseo = await wishlist.crearDeseo(yo, {
      nombre: `Deseo ${RONDA}`,
      marca: 'Copia',
      prioridad: 'LO_QUIERO',
      notasFondo: ['Ámbar', 'Cuero'],
    });
    await ajustes.guardarAjuste(yo, 'umbral_verano', 30);

    // Lo que hace la pantalla: descargar, y luego subir el fichero.
    const fichero = JSON.stringify(await datos.copiaCompleta(yo));

    // Despues de la copia cambian cosas, que la restauracion debe deshacer.
    await perfumes.crearPerfume(yo, perfume(contexto, `Posterior ${RONDA}`));
    await ajustes.guardarAjuste(yo, 'umbral_verano', 35);

    await datos.restaurarCopia(yo, JSON.parse(fichero));

    const coleccion = await consultas.listarColeccion(yo);
    expect(coleccion.map((p) => p.nombre)).toEqual([`Guardado ${RONDA}`]);
    const usos = await db.select().from(esquema.uso).where(orm.eq(esquema.uso.userId, yo));
    expect(usos).toHaveLength(1);
    expect(usos[0]!.creadoEn).toBeInstanceOf(Date);
    expect(await wishlist.notasFondoDeDeseo(deseo)).toEqual(['Ámbar', 'Cuero']);
    const configuracion = await ajustes.leerConfiguracion(yo);
    expect(configuracion.umbrales.umbralVerano).toBe(30);
  });

  it('una copia con una fecha rota no borra nada', async () => {
    const antes = await consultas.listarColeccion(yo);
    const copia = JSON.parse(JSON.stringify(await datos.copiaCompleta(yo)));
    copia.usos[0].creadoEn = 'no es una fecha';

    await expect(datos.restaurarCopia(yo, copia)).rejects.toThrow();
    expect(await consultas.listarColeccion(yo)).toEqual(antes);
  });
});
