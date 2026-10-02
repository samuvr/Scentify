/**
 * Completar un uso por la noche (seccion 6.1), contra PostgreSQL. Se salta
 * solo si no hay `DATABASE_URL`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { usuarioDePruebas } from './usuario';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;

cuando('completar los detalles de un uso', () => {
  let USUARIO: string;
  let usos: typeof import('@/servicios/usos');
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  let usoId: string;

  beforeAll(async () => {
    USUARIO = await usuarioDePruebas();
    usos = await import('@/servicios/usos');
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    db = (await import('@/db')).crearDb();
    const perfumes = await import('@/servicios/perfumes');
    const consultas = await import('@/servicios/consultas');
    const contexto = (await consultas.listarContextos(USUARIO))[0]!.id;
    const perfumeId = await perfumes.crearPerfume(USUARIO, {
      nombre: `Completar ${crypto.randomUUID().slice(0, 8)}`,
      marca: 'Pruebas',
      estado: 'LO_TENGO',
      notas: [],
      familiaIds: [],
      contextoIds: [contexto],
      estaciones: ['OTONO'],
      momentos: ['DIA'],
    });
    const registro = await usos.registrarUso(USUARIO, {
      perfumeId,
      fecha: '2027-02-01',
      momento: 'DIA',
      contextoId: contexto,
      estacionesForzadas: ['OTONO'],
    });
    usoId = registro.id;
  });

  const leer = async () =>
    (await db.select().from(esquema.uso).where(orm.eq(esquema.uso.id, usoId)))[0]!;

  it('rellena y luego vacía los campos: en blanco vuelve a «—»', async () => {
    await usos.completarUso(USUARIO, usoId, {
      sprays: 6,
      duracionPercibida: 'DE_6_8H',
      valoracionDia: 4,
      comentario: 'Aguantó toda la tarde',
    });
    expect(await leer()).toMatchObject({ sprays: 6, valoracionDia: 4, comentario: 'Aguantó toda la tarde' });

    await usos.completarUso(USUARIO, usoId, {
      sprays: null,
      duracionPercibida: null,
      valoracionDia: null,
      comentario: null,
    });
    expect(await leer()).toMatchObject({
      sprays: null,
      duracionPercibida: null,
      valoracionDia: null,
      comentario: null,
    });
  });

  it('sin nada que cambiar no falla', async () => {
    await expect(usos.completarUso(USUARIO, usoId, {})).resolves.toBeUndefined();
  });
});
