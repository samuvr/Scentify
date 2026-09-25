/**
 * Seccion 8 — Consultas de estadisticas.
 *
 * Los perfumes LO_TUVE cuentan aqui con su historial completo, aunque esten
 * fuera de las recomendaciones (regla 4.2). El unico filtro por estado es el
 * de "sin usar en el periodo", donde solo tiene sentido mirar lo que tengo.
 */
import 'server-only';
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import {
  compararIndicadores,
  indiceRotacion,
  periodoAnterior,
  type Comparacion,
  type Indicadores,
  type RangoFechas,
} from '@/dominio/estadisticas';
import type { DuracionPercibida, Estacion, Momento } from '@/dominio/tipos';

export interface FiltrosEstadisticas {
  momento?: Momento;
  contextoId?: string;
}

function condicionesUso(userId: string, rango: RangoFechas, filtros: FiltrosEstadisticas): SQL[] {
  const u = schema.uso;
  const lista: SQL[] = [
    eq(u.userId, userId),
    gte(u.fecha, rango.desde),
    lte(u.fecha, rango.hasta),
  ];
  if (filtros.momento) lista.push(eq(u.momento, filtros.momento));
  if (filtros.contextoId) lista.push(eq(u.contextoId, filtros.contextoId));
  return lista;
}

/** Indicadores agregados de un rango, para el propio periodo y para comparar. */
async function indicadoresDe(
  userId: string,
  rango: RangoFechas,
  filtros: FiltrosEstadisticas,
  totalColeccion: number,
): Promise<Indicadores> {
  const db = crearDb();
  const u = schema.uso;
  const [fila] = await db
    .select({
      usos: sql<number>`count(*)::int`,
      perfumesDistintos: sql<number>`count(distinct ${u.perfumeId})::int`,
      totales: sql<number>`count(*) filter (where ${u.idoneidadPct} = 100)::int`,
    })
    .from(u)
    .where(and(...condicionesUso(userId, rango, filtros)));

  const usos = fila?.usos ?? 0;
  return {
    usos,
    perfumesDistintos: fila?.perfumesDistintos ?? 0,
    rotacion: indiceRotacion(fila?.perfumesDistintos ?? 0, totalColeccion),
    tasaAcierto: usos === 0 ? 0 : Math.round((100 * (fila?.totales ?? 0)) / usos),
  };
}

export interface Estadisticas {
  indicadores: Indicadores;
  comparativa: Record<keyof Indicadores, Comparacion>;
  ranking: { id: string; nombre: string; marca: string; usos: number }[];
  sinUsar: { id: string; nombre: string; marca: string; ultimoUso: string | null }[];
  porFamilia: { nombre: string; usos: number }[];
  porNota: { nombre: string; usos: number }[];
  porContexto: { nombre: string; usos: number }[];
  porMomento: { momento: Momento; usos: number }[];
  heatmap: Map<string, number>;
  promedios: {
    spraysMedios: number | null;
    duracionMasFrecuente: DuracionPercibida | null;
    valoracionMedia: number | null;
  };
  porEstacion: { estacion: Estacion; usos: number }[];
  totalColeccion: number;
}

export async function calcularEstadisticas(
  userId: string,
  rango: RangoFechas,
  filtros: FiltrosEstadisticas = {},
): Promise<Estadisticas> {
  const db = crearDb();
  const u = schema.uso;
  const p = schema.perfume;
  const f = schema.ficha;
  const donde = and(...condicionesUso(userId, rango, filtros));

  // El denominador de la rotacion es lo que tengo, no lo que tuve.
  const [conteo] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(p)
    .where(and(eq(p.userId, userId), eq(p.estado, 'LO_TENGO'), eq(p.archivado, false)));
  const totalColeccion = conteo?.total ?? 0;

  const anterior = periodoAnterior(rango);

  const [
    indicadores,
    indicadoresAnteriores,
    ranking,
    porFamilia,
    porNota,
    porContexto,
    porMomento,
    porEstacion,
    diasConRegistro,
    promedios,
  ] = await Promise.all([
    indicadoresDe(userId, rango, filtros, totalColeccion),
    indicadoresDe(userId, anterior, filtros, totalColeccion),

    db
      .select({
        id: p.id,
        nombre: f.nombre,
        marca: f.marca,
        usos: sql<number>`count(*)::int`,
      })
      .from(u)
      .innerJoin(p, eq(p.id, u.perfumeId))
      .innerJoin(f, eq(f.id, p.fichaId))
      .where(donde)
      .groupBy(p.id, f.nombre, f.marca)
      .orderBy(desc(sql`count(*)`), asc(f.nombre)),

    db
      .select({ nombre: schema.familia.nombre, usos: sql<number>`count(*)::int` })
      .from(u)
      .innerJoin(p, eq(p.id, u.perfumeId))
      .innerJoin(schema.fichaFamilia, eq(schema.fichaFamilia.fichaId, p.fichaId))
      .innerJoin(schema.familia, eq(schema.familia.id, schema.fichaFamilia.familiaId))
      .where(donde)
      .groupBy(schema.familia.nombre)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({ nombre: schema.nota.nombre, usos: sql<number>`count(*)::int` })
      .from(u)
      .innerJoin(p, eq(p.id, u.perfumeId))
      .innerJoin(schema.fichaNota, eq(schema.fichaNota.fichaId, p.fichaId))
      .innerJoin(schema.nota, eq(schema.nota.id, schema.fichaNota.notaId))
      .where(donde)
      .groupBy(schema.nota.nombre)
      .orderBy(desc(sql`count(*)`))
      .limit(15),

    db
      .select({ nombre: schema.contexto.nombre, usos: sql<number>`count(*)::int` })
      .from(u)
      .innerJoin(schema.contexto, eq(schema.contexto.id, u.contextoId))
      .where(donde)
      .groupBy(schema.contexto.nombre)
      .orderBy(desc(sql`count(*)`)),

    db
      .select({ momento: u.momento, usos: sql<number>`count(*)::int` })
      .from(u)
      .where(donde)
      .groupBy(u.momento),

    db
      .select({ estacion: u.estacionEfectiva, usos: sql<number>`count(*)::int` })
      .from(u)
      .where(donde)
      .groupBy(u.estacionEfectiva),

    db
      .select({ fecha: sql<string>`${u.fecha}::text`, registros: sql<number>`count(*)::int` })
      .from(u)
      .where(donde)
      .groupBy(u.fecha),

    db
      .select({
        spraysMedios: sql<number | null>`round(avg(${u.sprays}))::int`,
        duracionMasFrecuente: sql<DuracionPercibida | null>`
          mode() within group (order by ${u.duracionPercibida})
        `,
        valoracionMedia: sql<number | null>`round(avg(${u.valoracionDia})::numeric, 1)::float8`,
      })
      .from(u)
      .where(donde),
  ]);

  // Sin usar en el periodo: en coleccion y con cero registros en el rango,
  // ordenados por lo que llevan sin ponerse (los nunca usados, primero).
  const sinUsar = await db
    .select({
      id: p.id,
      nombre: f.nombre,
      marca: f.marca,
      ultimoUso: sql<string | null>`(
        select max(fecha)::text from ${u} where ${u.perfumeId} = ${p.id}
      )`,
    })
    .from(p)
    .innerJoin(f, eq(f.id, p.fichaId))
    .where(
      and(
        eq(p.userId, userId),
        eq(p.estado, 'LO_TENGO'),
        eq(p.archivado, false),
        sql`not exists (
          select 1 from ${u}
          where ${u.perfumeId} = ${p.id}
            and ${u.fecha} between ${rango.desde} and ${rango.hasta}
        )`,
      ),
    )
    .orderBy(sql`(select max(fecha) from ${u} where ${u.perfumeId} = ${p.id}) asc nulls first`);

  return {
    indicadores,
    comparativa: compararIndicadores(indicadores, indicadoresAnteriores),
    ranking,
    sinUsar,
    porFamilia,
    porNota,
    porContexto,
    porMomento,
    porEstacion,
    heatmap: new Map(diasConRegistro.map((d) => [d.fecha, d.registros])),
    promedios: {
      spraysMedios: promedios[0]?.spraysMedios ?? null,
      duracionMasFrecuente: promedios[0]?.duracionMasFrecuente ?? null,
      valoracionMedia: promedios[0]?.valoracionMedia ?? null,
    },
    totalColeccion,
  };
}
