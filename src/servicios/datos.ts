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
import { claveBusqueda, normalizar } from '@/dominio/texto';
import { crearPerfume, resolverFicha } from './perfumes';
import type { Estacion, Momento } from '@/dominio/tipos';

/* ------------------------------------------------------------ exportacion */

export async function exportarColeccionCsv(userId: string): Promise<string> {
  const db = crearDb();

  const perfumes = await db
    .select({
      id: schema.perfume.id,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      concentracion: schema.ficha.concentracion,
      anioLanzamiento: schema.ficha.anioLanzamiento,
      fragranticaUrl: schema.ficha.fragranticaUrl,
      volumenMl: schema.perfume.volumenMl,
      fechaCompra: schema.perfume.fechaCompra,
      estado: schema.perfume.estado,
      valoracion: schema.perfume.valoracion,
      notasPersonales: schema.perfume.notasPersonales,
    })
    .from(schema.perfume)
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .where(eq(schema.perfume.userId, userId))
    .orderBy(asc(schema.ficha.marca), asc(schema.ficha.nombre));

  const ids = perfumes.map((p) => p.id);
  if (ids.length === 0) return serializarCsv([[...CABECERAS_COLECCION]]);

  const [notas, familias, contextos, estaciones, momentos] = await Promise.all([
    // La piramide y las familias son de la ficha; se leen por el frasco para
    // seguir agrupando por perfume como el resto de columnas.
    db
      .select({
        perfumeId: schema.perfume.id,
        nivel: schema.fichaNota.nivel,
        nombre: schema.nota.nombre,
        orden: schema.fichaNota.orden,
      })
      .from(schema.perfume)
      .innerJoin(schema.fichaNota, eq(schema.fichaNota.fichaId, schema.perfume.fichaId))
      .innerJoin(schema.nota, eq(schema.nota.id, schema.fichaNota.notaId))
      .where(inArray(schema.perfume.id, ids))
      .orderBy(asc(schema.fichaNota.orden)),
    db
      .select({ perfumeId: schema.perfume.id, nombre: schema.familia.nombre })
      .from(schema.perfume)
      .innerJoin(schema.fichaFamilia, eq(schema.fichaFamilia.fichaId, schema.perfume.fichaId))
      .innerJoin(schema.familia, eq(schema.familia.id, schema.fichaFamilia.familiaId))
      .where(inArray(schema.perfume.id, ids))
      .orderBy(asc(schema.fichaFamilia.orden)),
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
      perfume: schema.ficha.nombre,
      marca: schema.ficha.marca,
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
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
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
      .select({ clave: schema.ficha.busquedaNormalizada })
      .from(schema.perfume)
      .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
      .where(eq(schema.perfume.userId, userId)),
  ]);

  const nombresContexto = new Set(contextos.flatMap((c) => [normalizar(c.nombre), c.slug]));
  const nombresFamilia = new Set(familias.flatMap((f) => [normalizar(f.nombre), f.slug]));
  const clavesExistentes = new Set(existentes.map((e) => e.clave));

  const contextosDesconocidos = new Set<string>();
  const familiasDesconocidas = new Set<string>();
  const duplicados: string[] = [];
  const errores = [...analisis.errores];
  const importables: typeof analisis.filas = [];

  for (const fila of analisis.filas) {
    const resueltos = fila.contextos.filter((c) => nombresContexto.has(normalizar(c)));
    for (const c of fila.contextos) {
      if (!nombresContexto.has(normalizar(c))) contextosDesconocidos.add(c);
    }
    for (const f of fila.familias) {
      if (!nombresFamilia.has(normalizar(f))) familiasDesconocidas.add(f);
    }

    // El CSV traia contextos, pero ninguno existe en la coleccion: la fila no
    // se puede importar sin saltarse la regla de "minimo un contexto".
    if (resueltos.length === 0) {
      errores.push({
        linea: fila.linea,
        motivo: `Ningún contexto reconocido (${fila.contextos.join(', ')}). Créalo antes de importar.`,
      });
      continue;
    }

    if (clavesExistentes.has(normalizar(`${fila.nombre} ${fila.marca}`))) {
      duplicados.push(`${fila.nombre} · ${fila.marca}`);
    }
    importables.push(fila);
  }

  return {
    ...analisis,
    filas: importables,
    errores: errores.sort((a, b) => a.linea - b.linea),
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
 * Exige lo mismo que el alta manual: al menos un contexto, una estacion y un
 * momento. Las filas que no llegan se rechazan en la previsualizacion, con su
 * numero de linea y el motivo, antes de tocar la base de datos.
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
      .select({ clave: schema.ficha.busquedaNormalizada })
      .from(schema.perfume)
      .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
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
      await crearPerfume(userId, {
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
      });
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

/**
 * Volcado completo. Lo que sale de aqui vuelve a entrar tal cual.
 *
 * Version 2: los perfumes son frascos que apuntan a `fichas`, y la copia lleva
 * las fichas de mis frascos con su piramide y familias. Asi se puede restaurar
 * en otra base, o despues de que otra persona haya cambiado la ficha.
 */
export async function copiaCompleta(userId: string) {
  const db = crearDb();
  const perfumes = await db
    .select()
    .from(schema.perfume)
    .where(eq(schema.perfume.userId, userId));
  const ids = perfumes.map((p) => p.id);
  const fichaIds = [...new Set(perfumes.map((p) => p.fichaId))];
  // Las tablas hijas no llevan `user_id`: se filtran por los perfumes propios
  // en la consulta, no despues, para no leer las filas de las demas cuentas.
  // Con `inArray` vacio no hay consulta valida; sin perfumes no hay hijas.
  const conIds = <T>(consulta: () => Promise<T[]>) =>
    ids.length === 0 ? Promise.resolve([] as T[]) : consulta();

  const [contextos, usos, deseos, ajustes, notas, familias, fichas, fn, ff, pc, pe, pm] =
    await Promise.all([
      db.select().from(schema.contexto).where(eq(schema.contexto.userId, userId)),
      db.select().from(schema.uso).where(eq(schema.uso.userId, userId)),
      db.select().from(schema.wishlist).where(eq(schema.wishlist.userId, userId)),
      db.select().from(schema.ajuste).where(eq(schema.ajuste.userId, userId)),
      db.select().from(schema.nota),
      db.select().from(schema.familia),
      conIds(() => db.select().from(schema.ficha).where(inArray(schema.ficha.id, fichaIds))),
      conIds(() =>
        db.select().from(schema.fichaNota).where(inArray(schema.fichaNota.fichaId, fichaIds)),
      ),
      conIds(() =>
        db.select().from(schema.fichaFamilia).where(inArray(schema.fichaFamilia.fichaId, fichaIds)),
      ),
      conIds(() =>
        db
          .select()
          .from(schema.perfumeContexto)
          .where(inArray(schema.perfumeContexto.perfumeId, ids)),
      ),
      conIds(() =>
        db
          .select()
          .from(schema.perfumeEstacion)
          .where(inArray(schema.perfumeEstacion.perfumeId, ids)),
      ),
      conIds(() =>
        db.select().from(schema.perfumeMomento).where(inArray(schema.perfumeMomento.perfumeId, ids)),
      ),
    ]);

  return {
    version: 2 as const,
    generado: new Date().toISOString(),
    perfumes,
    fichas,
    fichaNota: fn,
    fichaFamilia: ff,
    contextos,
    usos,
    wishlist: deseos,
    ajustes,
    notas,
    familias,
    perfumeContexto: pc,
    perfumeEstacion: pe,
    perfumeMomento: pm,
  };
}

export type Copia = Awaited<ReturnType<typeof copiaCompleta>>;

type FilaFicha = Copia['fichas'][number];

/**
 * Las copias de antes de las fichas compartidas llevaban la ficha dentro de
 * cada perfume y la piramide en `perfumeNota`/`perfumeFamilia`. Se traducen a
 * la forma nueva: una ficha por perfume, con el mismo id, y al restaurar ya se
 * juntan con las que existan.
 */
interface CopiaV1 extends Omit<Copia, 'version' | 'perfumes' | 'fichas' | 'fichaNota' | 'fichaFamilia'> {
  version: 1;
  perfumes: (Omit<Copia['perfumes'][number], 'fichaId'> &
    Pick<FilaFicha, 'nombre' | 'marca' | 'concentracion' | 'anioLanzamiento' | 'fragranticaUrl'>)[];
  perfumeNota: { perfumeId: string; notaId: string; nivel: 'SALIDA' | 'CORAZON' | 'FONDO'; orden: number }[];
  perfumeFamilia: { perfumeId: string; familiaId: string; orden: number }[];
}

export function aVersion2(copia: Copia | CopiaV1): Copia {
  if (copia.version === 2) return copia;
  if (copia.version !== 1) throw new Error('Versión de copia no soportada.');
  const { perfumeNota, perfumeFamilia, ...resto } = copia;
  return {
    ...resto,
    version: 2,
    perfumes: copia.perfumes.map((p) => ({
      id: p.id,
      userId: p.userId,
      fichaId: p.id,
      volumenMl: p.volumenMl,
      fechaCompra: p.fechaCompra,
      estado: p.estado,
      valoracion: p.valoracion,
      notasPersonales: p.notasPersonales,
      archivado: p.archivado,
      creadoEn: p.creadoEn,
      actualizadoEn: p.actualizadoEn,
    })),
    fichas: copia.perfumes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      marca: p.marca,
      busquedaNormalizada: claveBusqueda(p.nombre, p.marca),
      concentracion: p.concentracion,
      anioLanzamiento: p.anioLanzamiento,
      fragranticaUrl: p.fragranticaUrl,
      creadaPor: p.userId,
      creadoEn: p.creadoEn,
      actualizadoEn: p.actualizadoEn,
    })),
    fichaNota: perfumeNota.map(({ perfumeId, ...n }) => ({ ...n, fichaId: perfumeId })),
    fichaFamilia: perfumeFamilia.map(({ perfumeId, ...f }) => ({ ...f, fichaId: perfumeId })),
  };
}

/**
 * Restauracion: reemplaza TODO lo del usuario por lo que traiga la copia.
 * Destructivo a proposito; la pantalla lo confirma antes de llamar aqui.
 *
 * Las fichas no se reemplazan, porque son de todos: cada ficha de la copia se
 * junta con la que ya haya con el mismo nombre, marca y concentracion, y solo
 * se le rellena lo que le falte. Si no existe, se crea.
 */
export async function restaurarCopia(userId: string, entrada: Copia | CopiaV1): Promise<void> {
  const copia = aVersion2(entrada);
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

  // Las notas y familias de la copia se resuelven por nombre y slug, no por
  // id: en otra base la misma nota puede tener otro id.
  const familiasBase = await db.select().from(schema.familia);
  const familiaPorSlug = new Map(familiasBase.map((f) => [f.slug, f.id]));
  const slugDeFamilia = new Map(copia.familias.map((f) => [f.id, f.slug]));
  const nombreDeNota = new Map(copia.notas.map((n) => [n.id, n.nombre]));

  const fichaReal = new Map<string, string>();
  for (const ficha of copia.fichas) {
    const notas = copia.fichaNota
      .filter((n) => n.fichaId === ficha.id)
      .sort((a, b) => a.orden - b.orden)
      .map((n) => ({ nombre: nombreDeNota.get(n.notaId) ?? '', nivel: n.nivel, orden: n.orden }))
      .filter((n) => n.nombre);
    const familiaIds = copia.fichaFamilia
      .filter((f) => f.fichaId === ficha.id)
      .sort((a, b) => a.orden - b.orden)
      .map((f) => familiaPorSlug.get(slugDeFamilia.get(f.familiaId) ?? ''))
      .filter((id): id is string => Boolean(id));
    fichaReal.set(
      ficha.id,
      await resolverFicha(userId, {
        nombre: ficha.nombre,
        marca: ficha.marca,
        concentracion: ficha.concentracion,
        anioLanzamiento: ficha.anioLanzamiento,
        fragranticaUrl: ficha.fragranticaUrl,
        notas,
        familiaIds,
      }),
    );
  }

  const conUsuario = <T extends object>(filas: T[]) => filas.map((f) => ({ ...f, userId }));

  /*
   * Las filas que cuelgan de un perfume o de un contexto solo entran si ese
   * perfume o contexto viene en la misma copia. El `user_id` de perfumes,
   * contextos y usos se fuerza al de la sesion, pero las tablas hijas no lo
   * tienen: una copia manipulada podria meter contextos o usos en los
   * perfumes de otra cuenta con solo poner sus ids.
   */
  const perfumes = copia.perfumes
    .filter((p) => fichaReal.has(p.fichaId))
    .map((p) => ({ ...p, fichaId: fichaReal.get(p.fichaId)! }));
  const perfumesCopia = new Set(perfumes.map((p) => p.id));
  const contextosCopia = new Set(copia.contextos.map((c) => c.id));
  const deMisPerfumes = <T extends { perfumeId: string }>(filas: T[]) =>
    filas.filter((f) => perfumesCopia.has(f.perfumeId));
  const perfumeEstacion = deMisPerfumes(copia.perfumeEstacion);
  const perfumeMomento = deMisPerfumes(copia.perfumeMomento);
  const perfumeContexto = deMisPerfumes(copia.perfumeContexto).filter((f) =>
    contextosCopia.has(f.contextoId),
  );
  const usos = deMisPerfumes(copia.usos).filter((u) => contextosCopia.has(u.contextoId));
  const deseos = copia.wishlist.map((d) =>
    d.convertidoAPerfumeId && !perfumesCopia.has(d.convertidoAPerfumeId)
      ? { ...d, convertidoAPerfumeId: null }
      : d,
  );

  if (copia.contextos.length > 0) {
    await db.insert(schema.contexto).values(conUsuario(copia.contextos));
  }
  if (perfumes.length > 0) {
    await db.insert(schema.perfume).values(conUsuario(perfumes));
  }
  await Promise.all([
    perfumeContexto.length ? db.insert(schema.perfumeContexto).values(perfumeContexto) : null,
    perfumeEstacion.length ? db.insert(schema.perfumeEstacion).values(perfumeEstacion) : null,
    perfumeMomento.length ? db.insert(schema.perfumeMomento).values(perfumeMomento) : null,
  ]);
  if (usos.length > 0) await db.insert(schema.uso).values(conUsuario(usos));
  if (deseos.length > 0) await db.insert(schema.wishlist).values(conUsuario(deseos));
  if (copia.ajustes.length > 0) {
    await db.insert(schema.ajuste).values(conUsuario(copia.ajustes)).onConflictDoNothing();
  }
}
