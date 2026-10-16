/**
 * El desglose de la tasa de acierto y los usos por combinacion de Huecos son
 * SQL sobre el snapshot de idoneidad. Los usos de este test van a un contexto
 * propio (archivado, para no aparecer en las pantallas ni en otros tests), asi
 * que se cuentan exactos aunque otros tests registren usos a la vez.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { usuarioDePruebas } from './usuario';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
let USUARIO: string;

cuando('desglose de la tasa de acierto y usos por combinación', () => {
  const sufijo = Date.now();
  const rango = { desde: '2000-01-01', hasta: '2999-12-31' };
  let contextoId: string;
  let perfumeId: string;

  beforeAll(async () => {
    USUARIO = await usuarioDePruebas();
    const { crearDb, schema } = await import('@/db');
    const perfumes = await import('@/servicios/perfumes');
    const usos = await import('@/servicios/usos');

    const [contexto] = await crearDb()
      .insert(schema.contexto)
      .values({ userId: USUARIO, slug: `prueba-${sufijo}`, nombre: 'Prueba', orden: 999, archivado: true })
      .returning({ id: schema.contexto.id });
    contextoId = contexto!.id;

    perfumeId = await perfumes.crearPerfume(USUARIO, {
      nombre: `Acierto ${sufijo}`,
      marca: 'Prueba',
      estado: 'LO_TENGO',
      notas: [],
      familiaIds: [],
      contextoIds: [contextoId],
      estaciones: ['OTONO'],
      momentos: ['DIA'],
    });

    const base = { perfumeId, contextoId, estacionesForzadas: ['OTONO' as const] };
    // Encaja del todo.
    await usos.registrarUso(USUARIO, { ...base, fecha: '2001-10-01', momento: 'DIA' });
    // Falla el momento.
    await usos.registrarUso(USUARIO, { ...base, fecha: '2001-10-02', momento: 'NOCHE' });
    // Falla momento y estacion.
    await usos.registrarUso(USUARIO, {
      ...base,
      fecha: '2001-10-03',
      momento: 'NOCHE',
      estacionesForzadas: ['VERANO'],
    });
  });

  it('cuenta aciertos y fallos por eje desde el snapshot de cada uso', async () => {
    const { calcularEstadisticas } = await import('@/servicios/estadisticas');
    const datos = await calcularEstadisticas(USUARIO, rango, { contextoId });

    expect(datos.desgloseAcierto).toEqual({
      usos: 3,
      aciertos: 1,
      fallosContexto: 0,
      fallosMomento: 2,
      fallosEstacion: 1,
    });
    expect(datos.indicadores.tasaAcierto).toBe(33);
    expect(datos.masFallados).toEqual([
      { id: perfumeId, nombre: `Acierto ${sufijo}`, marca: 'Prueba', fallos: 2 },
    ]);
  });

  it('agrupa los usos por contexto, momento y estación efectiva', async () => {
    const { usosPorCombinacion } = await import('@/servicios/consultas');
    const propias = (await usosPorCombinacion(USUARIO, rango.desde))
      .filter((c) => c.contextoId === contextoId)
      .sort((a, b) => `${a.momento}${a.estacion}`.localeCompare(`${b.momento}${b.estacion}`));
    expect(propias).toEqual([
      { contextoId, momento: 'DIA', estacion: 'OTONO', usos: 1 },
      { contextoId, momento: 'NOCHE', estacion: 'OTONO', usos: 1 },
      { contextoId, momento: 'NOCHE', estacion: 'VERANO', usos: 1 },
    ]);
  });
});
