/**
 * Seccion 9 — Exportacion, importacion y copia de seguridad.
 *
 * "No es opcional: se introduce mucha informacion a mano y perderla seria
 * inaceptable." Asi que: CSV de coleccion y de usos, JSON completo de ida y
 * vuelta, e importacion con previsualizacion antes de tocar nada.
 */
import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import {
  analizarCsvColeccion,
  CABECERAS_COLECCION,
  serializarCsv,
  SEPARADOR_LISTA,
  type ErrorFila,
  type FilaColeccion,
} from '@/dominio/csv';
import { normalizar } from '@/dominio/texto';
import { crearPerfume } from './perfumes';
import type { Estacion, Momento } from '@/dominio/tipos';

/* ------------------------------------------------------------ exportacion */

export async function exportarColeccionCsv(userId: string): Promise<string> {
  const db = crearDb();

  const perfumes = await db
    .select()
    .from(schema.perfume)
    .where(eq(schema.perfume.userId, userId))
    .orderBy(asc(schema.perfume.marca), asc(schema.perfume.nombre));

  const ids = perfumes.map((p) => p.id);
  if (ids.length === 0) return serializarCsv([[...CABECERAS_COLECCION]]);

  const [notas, familias, contextos, estaciones, momentos] = await Promise.all([
    db
      .select({
        perfumeId: schema.perfumeNota.perfumeId,
        nivel: schema.perfumeNota.nivel,
        nombre: schema.nota.nombre,
        orden: schema.perfumeNota.orden,
      })
      .from(schema.perfumeNota)
      .innerJoin(schema.nota, eq(schema.nota.id, schema.perfumeNota.notaId))
      .where(inArray(schema.perfumeNota.perfumeId, ids))
      .orderBy(asc(schema.perfumeNota.orden)),
    db
      .select({ perfumeId: schema.perfumeFamilia.perfumeId, nombre: schema.familia.nombre })
      .from(schema.perfumeFamilia)
      .innerJoin(schema.familia, eq(schema.familia.id, schema.perfumeFamilia.familiaId))
      .where(inArray(schema.perfumeFamilia.perfumeId, ids)),
    db
      .select({ perfumeId: schema.perfumeContexto.perfumeId, nombre: schema.contexto.nombre })
      .from(schema.perfumeContexto)
      .innerJoin(schema.contexto, eq(schema.contexto.id, schema.perfumeContexto.contextoId))
      .where(inArray(schema.perfumeContexto.perfumeId, ids)),
    db.select().from(schema.perfumeEstacion).where(inArray(schema.perfumeEstacion.perfumeId, ids)),
    db.select().from(schema.perfumeMomento).where(inArray(schema.perfumeMomento.perfumeId, ids)),
  ]);

  const juntar = <T>(filas: T[], id: (f: T) => string, valor: (f: T) => string) => {
    const mapa = new Map<string, string[]>();
    for (const fila of filas) {
      const lista = mapa.get(id(fila)) ?? [];
      lista.push(valor(fila));
      mapa.set(id(fila), lista);
    }
    return mapa;
  };

  const porNivel = (nivel: 'SALIDA' | 'CORAZON' | 'FONDO') =>
    juntar(
      notas.filter((n) => n.nivel === nivel),
      (n) => n.perfumeId,
      (n) => n.nombre,
    );

  const salida = porNivel('SALIDA');
  const corazon = porNivel('CORAZON');
  const fondo = porNivel('FONDO');
  const porFamilia = juntar(familias, (f) => f.perfumeId, (f) => f.nombre);
  const porContexto = juntar(contextos, (c) => c.perfumeId, (c) => c.nombre);
  const porEstacion = juntar(estaciones, (e) => e.perfumeId, (e) => e.estacion);
  const porMomento = juntar(momentos, (m) => m.perfumeId, (m) => m.momento);

  const unir = (mapa: Map<string, string[]>, id: string) =>
    (mapa.get(id) ?? []).join(SEPARADOR_LISTA);

  const filas = perfumes.map((p) => [
    p.nombre,
    p.marca,
    p.concentracion ?? '',
    p.anioLanzamiento?.toString() ?? '',
    p.volumenMl?.toString() ?? '',
    p.fechaCompra ?? '',
    p.estado,
    p.valoracion?.toString() ?? '',
    unir(salida, p.id),
    unir(corazon, p.id),
    unir(fondo, p.id),
    unir(porFamilia, p.id),
    unir(porContexto, p.id),
    unir(porEstacion, p.id),
    unir(porMomento, p.id),
    p.fragranticaUrl ?? '',
    p.notasPersonales ?? '',
  ]);

  return serializarCsv([[...CABECERAS_COLECCION], ...filas]);
}

const CABECERAS_USOS = [
  'fecha',
  'perfume',
  'marca',
  'momento',
  'contexto',
  'sprays',
  'duracion_percibida',
  'valoracion_dia',
  'idoneidad_pct',
  'idoneidad_momento',
  'idoneidad_contexto',
  'idoneidad_estacion',
  'estacion_efectiva',
  'estaciones_efectivas',
  'origen_estacion',
  'comentario',
] as const;

export async function exportarUsosCsv(userId: string): Promise<string> {
  const db = crearDb();
  const usos = await db
    .select({
      fecha: schema.uso.fecha,
      perfume: schema.perfume.nombre,
      marca: schema.perfume.marca,
      momento: schema.uso.momento,
      contexto: schema.contexto.nombre,
      sprays: schema.uso.sprays,
      duracionPercibida: schema.uso.duracionPercibida,
      valoracionDia: schema.uso.valoracionDia,
      idoneidadPct: schema.uso.idoneidadPct,
      idoneidadDetalle: schema.uso.idoneidadDetalle,
      estacionEfectiva: schema.uso.estacionEfectiva,
      estacionesEfectivas: schema.uso.estacionesEfectivas,
      origenEstacion: schema.uso.origenEstacion,
      comentario: schema.uso.comentario,
    })
    .from(schema.uso)
    .innerJoin(schema.perfume, eq(schema.perfume.id, schema.uso.perfumeId))
    .innerJoin(schema.contexto, eq(schema.contexto.id, schema.uso.contextoId))
    .where(eq(schema.uso.userId, userId))
    .orderBy(asc(schema.uso.fecha));

  const filas = usos.map((u) => [
    u.fecha,
    u.perfume,
    u.marca,
    u.momento,
    u.contexto,
    u.sprays?.toString() ?? '',
    u.duracionPercibida ?? '',
    u.valoracionDia?.toString() ?? '',
    String(u.idoneidadPct),
    String(u.idoneidadDetalle?.momento ?? ''),
    String(u.idoneidadDetalle?.contexto ?? ''),
    String(u.idoneidadDetalle?.estacion ?? ''),
    u.estacionEfectiva,
    u.estacionesEfectivas.join(SEPARADOR_LISTA),
    u.origenEstacion,
    u.comentario ?? '',
  ]);

  return serializarCsv([[...CABECERAS_USOS], ...filas]);
}

/* ------------------------------------------------------------- importacion */

export interface PrevisualizacionImportacion {
  filas: FilaColeccion[];
  errores: ErrorFila[];
  cabecerasDesconocidas: string[];
  /** Contextos y familias del fichero que no existen todavia. */
  contextosDesconocidos: string[];
  familiasDesconocidas: string[];
  /** Nombres que ya estan en la coleccion, para avisar del duplicado. */
  duplicados: string[];
}

export async function previsualizarImportacion(
  userId: string,
  texto: string,
): Promise<PrevisualizacionImportacion> {
  const analisis = analizarCsvColeccion(texto);
  const db = crearDb();

  const [contextos, familias, existentes] = await Promise.all([
    db.select().from(schema.contexto).where(eq(schema.contexto.userId, userId)),
    db.select().from(schema.familia),
    db
      .select({ clave: schema.perfume.busquedaNormalizada })
      .from(schema.perfume)
      .where(eq(schema.perfume.userId, userId)),
  ]);

  const nombresContexto = new Set(contextos.flatMap((c) => [normalizar(c.nombre), c.slug]));
  const nombresFamilia = new Set(familias.flatMap((f) => [normalizar(f.nombre), f.slug]));
  const clavesExistentes = new Set(existentes.map((e) => e.clave));

  const contextosDesconocidos = new Set<string>();
  const familiasDesconocidas = new Set<string>();
  const duplicados: string[] = [];

  for (const fila of analisis.filas) {
    for (const c of fila.contextos) {
      if (!nombresContexto.has(normalizar(c))) contextosDesconocidos.add(c);
    }
    for (const f of fila.familias) {
      if (!nombresFamilia.has(normalizar(f))) familiasDesconocidas.add(f);
    }
    if (clavesExistentes.has(normalizar(`${fila.nombre} ${fila.marca}`))) {
      duplicados.push(`${fila.nombre} · ${fila.marca}`);
    }
  }

  return {
    ...analisis,
    contextosDesconocidos: [...contextosDesconocidos],
    familiasDesconocidas: [...familiasDesconocidas],
    duplicados,
  };
}

export interface ResultadoImportacionFinal {
  creados: number;
  omitidos: number;
  errores: string[];
}

/**
 * Importa las filas validas.
 *
 * Al contrario que el alta manual, aqui NO se exige contexto, estacion ni
 * momento: el CSV del primer dia es para meter la coleccion entera de golpe y
 * bloquear cuarenta filas por eso la haria inservible. Lo que entre sin
 * categorizar queda visible en la ficha para completarlo despues.
 */
export async function importarColeccion(
  userId: string,
  filas: FilaColeccion[],
  opciones: { omitirDuplicados: boolean },
): Promise<ResultadoImportacionFinal> {
  const db = crearDb();
  const [contextos, familias, existentes] = await Promise.all([
    db.select().from(schema.contexto).where(eq(schema.contexto.userId, userId)),
    db.select().from(schema.familia),
    db
      .select({ clave: schema.perfume.busquedaNormalizada })
      .from(schema.perfume)
      .where(eq(schema.perfume.userId, userId)),
  ]);

  const idContexto = new Map<string, string>();
  for (const c of contextos) {
    idContexto.set(normalizar(c.nombre), c.id);
    idContexto.set(c.slug, c.id);
  }
  const idFamilia = new Map<string, string>();
  for (const f of familias) {
    idFamilia.set(normalizar(f.nombre), f.id);
    idFamilia.set(f.slug, f.id);
  }
  const clavesExistentes = new Set(existentes.map((e) => e.clave));

  const resultado: ResultadoImportacionFinal = { creados: 0, omitidos: 0, errores: [] };

  for (const fila of filas) {
    const clave = normalizar(`${fila.nombre} ${fila.marca}`);
    if (opciones.omitirDuplicados && clavesExistentes.has(clave)) {
      resultado.omitidos += 1;
      continue;
    }

    try {
      await crearPerfume(
        userId,
        {
          nombre: fila.nombre,
          marca: fila.marca,
          concentracion: fila.concentracion as never,
          anioLanzamiento: fila.anioLanzamiento,
          volumenMl: fila.volumenMl,
          fechaCompra: fila.fechaCompra,
          estado: fila.estado,
          valoracion: fila.valoracion,
          notasPersonales: fila.notasPersonales,
          fragranticaUrl: fila.fragranticaUrl,
          notas: [
            ...fila.notasSalida.map((nombre) => ({ nombre, nivel: 'SALIDA' as const })),
            ...fila.notasCorazon.map((nombre) => ({ nombre, nivel: 'CORAZON' as const })),
            ...fila.notasFondo.map((nombre) => ({ nombre, nivel: 'FONDO' as const })),
          ],
          familiaIds: fila.familias
            .map((f) => idFamilia.get(normalizar(f)))
            .filter((id): id is string => Boolean(id)),
          contextoIds: fila.contextos
            .map((c) => idContexto.get(normalizar(c)))
            .filter((id): id is string => Boolean(id)),
          estaciones: fila.estaciones as Estacion[],
          momentos: fila.momentos as Momento[],
        },
        { permitirIncompleto: true },
      );
      clavesExistentes.add(clave);
      resultado.creados += 1;
    } catch (error) {
      resultado.errores.push(
        `${fila.nombre} · ${fila.marca}: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }

  return resultado;
}

/* ------------------------------------------------------------------ backup */

/** Volcado completo. Lo que sale de aqui vuelve a entrar tal cual. */
export async function copiaCompleta(userId: string) {
  const db = crearDb();
  const perfumes = await db
    .select()
    .from(schema.perfume)
    .where(eq(schema.perfume.userId, userId));
  const ids = perfumes.map((p) => p.id);
  const dePerfumes = <T extends { perfumeId: string }>(filas: T[]) =>
    filas.filter((f) => ids.includes(f.perfumeId));

  const [contextos, usos, deseos, ajustes, notas, familias, pn, pf, pc, pe, pm] =
    await Promise.all([
      db.select().from(schema.contexto).where(eq(schema.contexto.userId, userId)),
      db.select().from(schema.uso).where(eq(schema.uso.userId, userId)),
      db.select().from(schema.wishlist).where(eq(schema.wishlist.userId, userId)),
      db.select().from(schema.ajuste).where(eq(schema.ajuste.userId, userId)),
      db.select().from(schema.nota),
      db.select().from(schema.familia),
      db.select().from(schema.perfumeNota),
      db.select().from(schema.perfumeFamilia),
      db.select().from(schema.perfumeContexto),
      db.select().from(schema.perfumeEstacion),
      db.select().from(schema.perfumeMomento),
    ]);

  return {
    version: 1 as const,
    generado: new Date().toISOString(),
    perfumes,
    contextos,
    usos,
    wishlist: deseos,
    ajustes,
    notas,
    familias,
    perfumeNota: dePerfumes(pn),
    perfumeFamilia: dePerfumes(pf),
    perfumeContexto: dePerfumes(pc),
    perfumeEstacion: dePerfumes(pe),
    perfumeMomento: dePerfumes(pm),
  };
}

export type Copia = Awaited<ReturnType<typeof copiaCompleta>>;

/**
 * Restauracion: reemplaza TODO lo del usuario por lo que traiga la copia.
 * Destructivo a proposito; la pantalla lo confirma antes de llamar aqui.
 */
export async function restaurarCopia(userId: string, copia: Copia): Promise<void> {
  if (copia.version !== 1) throw new Error('Versión de copia no soportada.');
  const db = crearDb();

  // Orden inverso al de las dependencias: primero lo que apunta a otros.
  await db.delete(schema.uso).where(eq(schema.uso.userId, userId));
  await db.delete(schema.wishlist).where(eq(schema.wishlist.userId, userId));
  await db
    .delete(schema.recomendacionDescarte)
    .where(eq(schema.recomendacionDescarte.userId, userId));

  const mios = await db
    .select({ id: schema.perfume.id })
    .from(schema.perfume)
    .where(eq(schema.perfume.userId, userId));
  const ids = mios.map((p) => p.id);
  if (ids.length > 0) {
    await Promise.all([
      db.delete(schema.perfumeNota).where(inArray(schema.perfumeNota.perfumeId, ids)),
      db.delete(schema.perfumeFamilia).where(inArray(schema.perfumeFamilia.perfumeId, ids)),
      db.delete(schema.perfumeContexto).where(inArray(schema.perfumeContexto.perfumeId, ids)),
      db.delete(schema.perfumeEstacion).where(inArray(schema.perfumeEstacion.perfumeId, ids)),
      db.delete(schema.perfumeMomento).where(inArray(schema.perfumeMomento.perfumeId, ids)),
    ]);
    await db.delete(schema.perfume).where(eq(schema.perfume.userId, userId));
  }
  await db.delete(schema.contexto).where(eq(schema.contexto.userId, userId));

  // El vocabulario es global: se completa, no se reemplaza.
  if (copia.notas.length > 0) {
    await db.insert(schema.nota).values(copia.notas).onConflictDoNothing();
  }
  if (copia.familias.length > 0) {
    await db.insert(schema.familia).values(copia.familias).onConflictDoNothing();
  }

  const conUsuario = <T extends object>(filas: T[]) => filas.map((f) => ({ ...f, userId }));

  if (copia.contextos.length > 0) {
    await db.insert(schema.contexto).values(conUsuario(copia.contextos));
  }
  if (copia.perfumes.length > 0) {
    await db.insert(schema.perfume).values(conUsuario(copia.perfumes));
  }
  await Promise.all([
    copia.perfumeNota.length ? db.insert(schema.perfumeNota).values(copia.perfumeNota) : null,
    copia.perfumeFamilia.length
      ? db.insert(schema.perfumeFamilia).values(copia.perfumeFamilia)
      : null,
    copia.perfumeContexto.length
      ? db.insert(schema.perfumeContexto).values(copia.perfumeContexto)
      : null,
    copia.perfumeEstacion.length
      ? db.insert(schema.perfumeEstacion).values(copia.perfumeEstacion)
      : null,
    copia.perfumeMomento.length
      ? db.insert(schema.perfumeMomento).values(copia.perfumeMomento)
      : null,
  ]);
  if (copia.usos.length > 0) await db.insert(schema.uso).values(conUsuario(copia.usos));
  if (copia.wishlist.length > 0) await db.insert(schema.wishlist).values(conUsuario(copia.wishlist));
  if (copia.ajustes.length > 0) {
    await db.insert(schema.ajuste).values(conUsuario(copia.ajustes)).onConflictDoNothing();
  }
}
