/**
 * Reglas duras del MVP verificadas contra PostgreSQL de verdad.
 *
 * Son las que la especificacion marca como explicitas y que un test de dominio
 * no puede demostrar, porque quien las hace cumplir es el esquema.
 * Se saltan solos si no hay `DATABASE_URL`.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { usuarioDePruebas } from './usuario';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
let USUARIO: string;

cuando('reglas duras', () => {
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let perfumes: typeof import('@/servicios/perfumes');
  let usos: typeof import('@/servicios/usos');
  let consultas: typeof import('@/servicios/consultas');
  let dominio: typeof import('@/dominio/recomendacion');
  let contextoId: string;
  let perfumeId: string;

  beforeAll(async () => {
    USUARIO = await usuarioDePruebas();
    const modulo = await import('@/db');
    esquema = await import('@/db/schema');
    perfumes = await import('@/servicios/perfumes');
    usos = await import('@/servicios/usos');
    consultas = await import('@/servicios/consultas');
    dominio = await import('@/dominio/recomendacion');
    db = modulo.crearDb();

    const contextos = await consultas.listarContextos(USUARIO);
    contextoId = contextos[0]!.id;

    perfumeId = await perfumes.crearPerfume(USUARIO, {
      nombre: 'Reglas Duras',
      marca: 'Prueba',
      estado: 'LO_TENGO',
      notas: [{ nombre: 'Oud', nivel: 'FONDO' }],
      familiaIds: [],
      contextoIds: [contextoId],
      estaciones: ['OTONO'],
      momentos: ['NOCHE'],
    });
  });

  it('un perfume con historial no se puede borrar de la base de datos', async () => {
    await usos.registrarUso(USUARIO, {
      perfumeId,
      fecha: '2026-09-01',
      momento: 'NOCHE',
      contextoId,
      estacionesForzadas: ['OTONO'],
    });

    const { eq } = await import('drizzle-orm');
    await expect(
      db.delete(esquema.perfume).where(eq(esquema.perfume.id, perfumeId)),
    ).rejects.toThrow(/foreign key|viola/i);
  });

  it('el alta manual exige contexto, estación y momento', async () => {
    await expect(
      perfumes.crearPerfume(USUARIO, {
        nombre: 'Sin categorizar',
        marca: 'Prueba',
        estado: 'LO_TENGO',
        notas: [],
        familiaIds: [],
        contextoIds: [],
        estaciones: ['OTONO'],
        momentos: ['NOCHE'],
      }),
    ).rejects.toThrow(/contexto/i);
  });

  it('el snapshot de idoneidad no cambia aunque cambie el perfume (criterio 10)', async () => {
    const { eq, and } = await import('drizzle-orm');

    const antes = await db
      .select({ pct: esquema.uso.idoneidadPct, detalle: esquema.uso.idoneidadDetalle })
      .from(esquema.uso)
      .where(and(eq(esquema.uso.perfumeId, perfumeId), eq(esquema.uso.fecha, '2026-09-01')));
    expect(antes[0]?.pct).toBe(100);

    // Se le quita el contexto con el que se registró.
    await perfumes.actualizarPerfume(USUARIO, perfumeId, {
      nombre: 'Reglas Duras',
      marca: 'Prueba',
      estado: 'LO_TENGO',
      notas: [],
      familiaIds: [],
      contextoIds: (await consultas.listarContextos(USUARIO)).slice(1, 2).map((c) => c.id),
      estaciones: ['VERANO'],
      momentos: ['DIA'],
    });

    const despues = await db
      .select({ pct: esquema.uso.idoneidadPct, detalle: esquema.uso.idoneidadDetalle })
      .from(esquema.uso)
      .where(and(eq(esquema.uso.perfumeId, perfumeId), eq(esquema.uso.fecha, '2026-09-01')));

    expect(despues[0]?.pct).toBe(100);
    expect(despues[0]?.detalle).toEqual(antes[0]?.detalle);
  });

  it('LO_TUVE sale de las recomendaciones pero sigue contando en estadísticas (criterio 9)', async () => {
    const estadisticas = await import('@/servicios/estadisticas');
    const rango = { desde: '2026-01-01', hasta: '2026-12-31' };

    const antesDelCambio = await estadisticas.calcularEstadisticas(USUARIO, rango);
    const usosDelPerfume =
      antesDelCambio.ranking.find((f) => f.id === perfumeId)?.usos ?? 0;
    expect(usosDelPerfume).toBeGreaterThan(0);

    await perfumes.cambiarEstado(USUARIO, perfumeId, 'LO_TUVE');

    const candidatos = await consultas.candidatosParaRecomendar(USUARIO);
    const recomendacion = dominio.recomendar({
      coleccion: candidatos,
      momento: 'NOCHE',
      contextoId,
      estacionesCompatibles: ['OTONO'],
      hoy: '2026-09-21',
    });
    const enRecomendaciones = [
      ...recomendacion.recomendaciones.map((r) => r.perfume.id),
      ...recomendacion.nuncaUsados.map((p) => p.id),
    ];
    expect(enRecomendaciones).not.toContain(perfumeId);

    const despues = await estadisticas.calcularEstadisticas(USUARIO, rango);
    expect(despues.ranking.find((f) => f.id === perfumeId)?.usos).toBe(usosDelPerfume);
  });

  it('archivar sí funciona, y el archivado desaparece de las recomendaciones', async () => {
    await perfumes.cambiarEstado(USUARIO, perfumeId, 'LO_TENGO');
    await perfumes.archivarPerfume(USUARIO, perfumeId, true);

    const candidatos = await consultas.candidatosParaRecomendar(USUARIO);
    expect(candidatos.find((c) => c.id === perfumeId)?.archivado).toBe(true);

    const recomendacion = dominio.recomendar({
      coleccion: candidatos,
      momento: 'NOCHE',
      contextoId,
      estacionesCompatibles: ['OTONO'],
      hoy: '2026-09-21',
    });
    expect(recomendacion.recomendaciones.map((r) => r.perfume.id)).not.toContain(perfumeId);
  });

  it('los votos de Fragrantica no están en ninguna columna del esquema (5.3)', async () => {
    const { sql } = await import('drizzle-orm');
    const filas = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sql`information_schema.columns`)
      .where(
        sql`table_schema = 'public' and (column_name ilike '%voto%' or column_name ilike '%vote%')`,
      );
    expect(filas[0]?.n).toBe(0);
  });
});
