/**
 * «Ajustar» un registro y buscar por palabras, contra PostgreSQL. Se salta
 * solo si no hay `DATABASE_URL`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { usuarioDePruebas } from './usuario';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;

cuando('ajustar un registro sin perderlo', () => {
  let USUARIO: string;
  let usos: typeof import('@/servicios/usos');
  let consultas: typeof import('@/servicios/consultas');
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  let perfumeId: string;
  let contextos: string[];
  const sufijo = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    USUARIO = await usuarioDePruebas();
    usos = await import('@/servicios/usos');
    consultas = await import('@/servicios/consultas');
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    db = (await import('@/db')).crearDb();
    const perfumes = await import('@/servicios/perfumes');
    contextos = (await consultas.listarContextos(USUARIO)).map((c) => c.id);
    perfumeId = await perfumes.crearPerfume(USUARIO, {
      nombre: `Khamrah ${sufijo}`,
      marca: 'Lattafa Ajustes',
      estado: 'LO_TENGO',
      notas: [],
      familiaIds: [],
      contextoIds: [contextos[0]!],
      estaciones: ['OTONO'],
      momentos: ['DIA'],
    });
  });

  const leer = async (id: string) =>
    (await db.select().from(esquema.uso).where(orm.eq(esquema.uso.id, id)))[0];

  it('sustituye el viejo por el nuevo con el snapshot recalculado', async () => {
    const viejo = await usos.registrarUso(USUARIO, {
      perfumeId,
      fecha: '2027-03-01',
      momento: 'DIA',
      contextoId: contextos[0]!,
      estacionesForzadas: ['OTONO'],
    });
    const nuevo = await usos.reemplazarUso(USUARIO, viejo.id, {
      id: crypto.randomUUID(),
      perfumeId,
      fecha: '2027-03-01',
      momento: 'NOCHE',
      contextoId: contextos[1]!,
      sprays: 4,
      estacionesForzadas: ['OTONO'],
    });

    expect(await leer(viejo.id)).toBeUndefined();
    const fila = await leer(nuevo.id);
    expect(fila).toMatchObject({ momento: 'NOCHE', contextoId: contextos[1], sprays: 4 });
    // Noche y otro contexto no estan marcados: el snapshot es el del nuevo.
    expect(fila?.idoneidadPct).toBe(33);
  });

  it('si el nuevo no vale, el viejo sigue ahí', async () => {
    const viejo = await usos.registrarUso(USUARIO, {
      perfumeId,
      fecha: '2027-03-02',
      momento: 'DIA',
      contextoId: contextos[0]!,
      estacionesForzadas: ['OTONO'],
    });
    await expect(
      usos.reemplazarUso(USUARIO, viejo.id, {
        perfumeId: crypto.randomUUID(),
        fecha: '2027-03-02',
        momento: 'DIA',
        contextoId: contextos[0]!,
      }),
    ).rejects.toThrow('Perfume no encontrado.');
    expect(await leer(viejo.id)).toBeDefined();
  });

  it('no borra un uso de otra cuenta', async () => {
    const viejo = await usos.registrarUso(USUARIO, {
      perfumeId,
      fecha: '2027-03-03',
      momento: 'DIA',
      contextoId: contextos[0]!,
      estacionesForzadas: ['OTONO'],
    });
    const otraCuenta = crypto.randomUUID();
    await expect(
      usos.reemplazarUso(otraCuenta, viejo.id, {
        perfumeId,
        fecha: '2027-03-03',
        momento: 'DIA',
        contextoId: contextos[0]!,
      }),
    ).rejects.toThrow();
    expect(await leer(viejo.id)).toBeDefined();
  });

  it('busca por palabras sueltas y en cualquier orden', async () => {
    const encontrados = await consultas.buscarEnColeccion(USUARIO, `ajustes ${sufijo} khamrah`);
    expect(encontrados.map((p) => p.id)).toContain(perfumeId);
    const lista = await consultas.listarColeccion(USUARIO, { texto: `lattafa ${sufijo}` });
    expect(lista.map((p) => p.id)).toContain(perfumeId);
    expect(await consultas.buscarEnColeccion(USUARIO, `${sufijo} armaf`)).toEqual([]);
  });

  it('guarda la temperatura que decidió la estación', async () => {
    const r = await usos.registrarUso(USUARIO, {
      perfumeId,
      fecha: '2027-03-04',
      momento: 'DIA',
      contextoId: contextos[0]!,
      estacionesForzadas: ['OTONO'],
    });
    // Elegida a mano: no hay temperatura que guardar.
    expect(await leer(r.id)).toMatchObject({ temperaturaUsada: null, bochorno: false });
  });
});
