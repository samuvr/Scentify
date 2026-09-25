/**
 * Capa de lectura. Todo lo que las pantallas necesitan saber de la base de datos.
 *
 * Las consultas devuelven las formas que espera el dominio (`PerfumeCandidato`,
 * `PerfumeIdoneidad`, `PromediosPerfume`) para que la logica pura no tenga que
 * conocer el esquema.
 */
import 'server-only';
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import type { PerfumeCandidato } from '@/dominio/recomendacion';
import type {
  DuracionPercibida,
  Estacion,
  Momento,
  PerfumeIdoneidad,
  PromediosPerfume,
} from '@/dominio/tipos';
import { MINIMO_CARACTERES_BUSQUEDA, normalizar } from '@/dominio/texto';

/* ------------------------------------------------------------- contextos */

export async function listarContextos(userId: string) {
  const db = crearDb();
  return db
    .select()
    .from(schema.contexto)
    .where(and(eq(schema.contexto.userId, userId), eq(schema.contexto.archivado, false)))
    .orderBy(asc(schema.contexto.orden));
}

/* -------------------------------------------- agregados por perfume (4.3) */

/**
 * Subconsultas de historial, reutilizadas por la recomendacion y por la ficha.
 * Se calculan en SQL para no traerse el historial entero a memoria.
 */
function agregadosDeUso(userId: string) {
  const u = schema.uso;
  return crearDb()
    .select({
      perfumeId: u.perfumeId,
      vecesUsado: sql<number>`count(*)::int`.as('veces_usado'),
      ultimoUso: sql<string | null>`max(${u.fecha})::text`.as('ultimo_uso'),
      spraysHabituales: sql<number | null>`round(avg(${u.sprays}))::int`.as('sprays_habituales'),
      valoracionMedia: sql<number | null>`round(avg(${u.valoracionDia})::numeric, 1)::float8`.as(
        'valoracion_media',
      ),
      duracionEsperada: sql<DuracionPercibida | null>`
        mode() within group (order by ${u.duracionPercibida})
      `.as('duracion_esperada'),
    })
    .from(u)
    .where(eq(u.userId, userId))
    .groupBy(u.perfumeId)
    .as('agregados');
}

/** Las tres listas N:M de un perfume, en un solo viaje por tabla. */
async function marcasDePerfume(perfumeIds: string[]) {
  const vacio = {
    contextos: new Map<string, string[]>(),
    estaciones: new Map<string, Estacion[]>(),
    momentos: new Map<string, Momento[]>(),
  };
  if (perfumeIds.length === 0) return vacio;

  const db = crearDb();
  const [contextos, estaciones, momentos] = await Promise.all([
    db
      .select()
      .from(schema.perfumeContexto)
      .where(inArray(schema.perfumeContexto.perfumeId, perfumeIds)),
    db
      .select()
      .from(schema.perfumeEstacion)
      .where(inArray(schema.perfumeEstacion.perfumeId, perfumeIds)),
    db
      .select()
      .from(schema.perfumeMomento)
      .where(inArray(schema.perfumeMomento.perfumeId, perfumeIds)),
  ]);

  const agrupar = <T>(filas: { perfumeId: string }[], valor: (f: never) => T) => {
    const mapa = new Map<string, T[]>();
    for (const fila of filas) {
      const lista = mapa.get(fila.perfumeId) ?? [];
      lista.push(valor(fila as never));
      mapa.set(fila.perfumeId, lista);
    }
    return mapa;
  };

  return {
    contextos: agrupar<string>(contextos, (f: { contextoId: string }) => f.contextoId),
    estaciones: agrupar<Estacion>(estaciones, (f: { estacion: Estacion }) => f.estacion),
    momentos: agrupar<Momento>(momentos, (f: { momento: Momento }) => f.momento),
  };
}

/* ----------------------------------------------------------- recomendacion */

/**
 * Toda la coleccion en la forma que espera el motor de recomendacion.
 * Los filtros duros los aplica el dominio, no la consulta, para que el mismo
 * dato sirva tambien a la deteccion de huecos de la fase 2.
 */
export async function candidatosParaRecomendar(userId: string): Promise<PerfumeCandidato[]> {
  const db = crearDb();
  const agregados = agregadosDeUso(userId);

  const perfumes = await db
    .select({
      id: schema.perfume.id,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      estado: schema.perfume.estado,
      archivado: schema.perfume.archivado,
      vecesUsado: agregados.vecesUsado,
      ultimoUso: agregados.ultimoUso,
      spraysHabituales: agregados.spraysHabituales,
      valoracionMedia: agregados.valoracionMedia,
      duracionEsperada: agregados.duracionEsperada,
    })
    .from(schema.perfume)
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .leftJoin(agregados, eq(agregados.perfumeId, schema.perfume.id))
    .where(eq(schema.perfume.userId, userId));

  const marcas = await marcasDePerfume(perfumes.map((p) => p.id));

  return perfumes.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    marca: p.marca,
    estado: p.estado,
    archivado: p.archivado,
    momentos: marcas.momentos.get(p.id) ?? [],
    contextos: marcas.contextos.get(p.id) ?? [],
    estaciones: marcas.estaciones.get(p.id) ?? [],
    ultimoUso: p.ultimoUso ?? null,
    vecesUsado: p.vecesUsado ?? 0,
    promedios: {
      spraysHabituales: p.spraysHabituales ?? null,
      duracionEsperada: p.duracionEsperada ?? null,
      valoracionMedia: p.valoracionMedia ?? null,
    },
  }));
}

/** Ids descartados hoy con el boton "Otro" (seccion 7.2). */
export async function descartesDeHoy(userId: string, hoy: string): Promise<string[]> {
  const db = crearDb();
  const filas = await db
    .select({ perfumeId: schema.recomendacionDescarte.perfumeId })
    .from(schema.recomendacionDescarte)
    .where(
      and(
        eq(schema.recomendacionDescarte.userId, userId),
        eq(schema.recomendacionDescarte.fecha, hoy),
      ),
    );
  return filas.map((f) => f.perfumeId);
}

/* ---------------------------------------------------------------- perfume */

export async function marcasParaIdoneidad(
  perfumeId: string,
): Promise<PerfumeIdoneidad> {
  const marcas = await marcasDePerfume([perfumeId]);
  return {
    momentos: marcas.momentos.get(perfumeId) ?? [],
    contextos: marcas.contextos.get(perfumeId) ?? [],
    estaciones: marcas.estaciones.get(perfumeId) ?? [],
  };
}

export async function promediosDePerfume(
  userId: string,
  perfumeId: string,
): Promise<PromediosPerfume & { vecesUsado: number; ultimoUso: string | null }> {
  const db = crearDb();
  const u = schema.uso;
  const [fila] = await db
    .select({
      vecesUsado: sql<number>`count(*)::int`,
      ultimoUso: sql<string | null>`max(${u.fecha})::text`,
      spraysHabituales: sql<number | null>`round(avg(${u.sprays}))::int`,
      valoracionMedia: sql<number | null>`round(avg(${u.valoracionDia})::numeric, 1)::float8`,
      duracionEsperada: sql<DuracionPercibida | null>`
        mode() within group (order by ${u.duracionPercibida})
      `,
    })
    .from(u)
    .where(and(eq(u.userId, userId), eq(u.perfumeId, perfumeId)));

  return {
    vecesUsado: fila?.vecesUsado ?? 0,
    ultimoUso: fila?.ultimoUso ?? null,
    spraysHabituales: fila?.spraysHabituales ?? null,
    valoracionMedia: fila?.valoracionMedia ?? null,
    duracionEsperada: fila?.duracionEsperada ?? null,
  };
}

/* ------------------------------------------------------- busqueda (6.1) */

/**
 * Busqueda del registro diario: desde el tercer caracter, por nombre y marca,
 * insensible a acentos y mayusculas, solo perfumes no archivados.
 */
export async function buscarEnColeccion(userId: string, texto: string, limite = 8) {
  const consulta = normalizar(texto);
  if (consulta.length < MINIMO_CARACTERES_BUSQUEDA) return [];

  const db = crearDb();
  return db
    .select({
      id: schema.perfume.id,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      estado: schema.perfume.estado,
    })
    .from(schema.perfume)
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .where(
      and(
        eq(schema.perfume.userId, userId),
        eq(schema.perfume.archivado, false),
        ilike(schema.ficha.busquedaNormalizada, `%${consulta}%`),
      ),
    )
    .orderBy(asc(schema.ficha.nombre))
    .limit(limite);
}

/** Accesos rapidos del registro diario: los 5 usados mas recientemente. */
export async function usadosRecientemente(userId: string, limite = 5) {
  const db = crearDb();
  const u = schema.uso;
  return db
    .select({
      id: schema.perfume.id,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      ultimoUso: sql<string>`max(${u.fecha})::text`,
    })
    .from(u)
    .innerJoin(schema.perfume, eq(schema.perfume.id, u.perfumeId))
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .where(and(eq(u.userId, userId), eq(schema.perfume.archivado, false)))
    .groupBy(schema.perfume.id, schema.ficha.nombre, schema.ficha.marca)
    .orderBy(desc(sql`max(${u.fecha})`))
    .limit(limite);
}

/** Boton "Repetir el de ayer". */
export async function usoDeAyer(userId: string, ayer: string) {
  const db = crearDb();
  const [fila] = await db
    .select({
      perfumeId: schema.uso.perfumeId,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      momento: schema.uso.momento,
      contextoId: schema.uso.contextoId,
    })
    .from(schema.uso)
    .innerJoin(schema.perfume, eq(schema.perfume.id, schema.uso.perfumeId))
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .where(and(eq(schema.uso.userId, userId), eq(schema.uso.fecha, ayer)))
    .orderBy(desc(schema.uso.creadoEn))
    .limit(1);
  return fila ?? null;
}

/** Aviso de posible duplicado: mismo perfume, misma fecha (seccion 6.1). */
export async function yaRegistradoEse(
  userId: string,
  perfumeId: string,
  fecha: string,
): Promise<boolean> {
  const db = crearDb();
  const [fila] = await db
    .select({ id: schema.uso.id })
    .from(schema.uso)
    .where(
      and(
        eq(schema.uso.userId, userId),
        eq(schema.uso.perfumeId, perfumeId),
        eq(schema.uso.fecha, fecha),
      ),
    )
    .limit(1);
  return Boolean(fila);
}

/* -------------------------------------------------------------- coleccion */

export interface FiltrosColeccion {
  texto?: string;
  estado?: 'LO_TENGO' | 'LO_TUVE';
  marca?: string;
  familiaId?: string;
  notaId?: string;
  estacion?: Estacion;
  contextoId?: string;
  momento?: Momento;
  valoracionMinima?: number;
  incluirArchivados?: boolean;
  orden?: 'nombre' | 'marca' | 'ultimo-uso' | 'mas-usado';
}

export async function listarColeccion(userId: string, filtros: FiltrosColeccion = {}) {
  const db = crearDb();
  const agregados = agregadosDeUso(userId);
  const p = schema.perfume;
  const f = schema.ficha;

  const condiciones = [eq(p.userId, userId)];
  if (!filtros.incluirArchivados) condiciones.push(eq(p.archivado, false));
  if (filtros.estado) condiciones.push(eq(p.estado, filtros.estado));
  if (filtros.marca) condiciones.push(eq(f.marca, filtros.marca));
  if (filtros.valoracionMinima) condiciones.push(gte(p.valoracion, filtros.valoracionMinima));
  if (filtros.texto && normalizar(filtros.texto).length > 0) {
    condiciones.push(ilike(f.busquedaNormalizada, `%${normalizar(filtros.texto)}%`));
  }
  if (filtros.familiaId) {
    condiciones.push(
      sql`exists (select 1 from ${schema.fichaFamilia} ff
                  where ff.ficha_id = ${p.fichaId} and ff.familia_id = ${filtros.familiaId})`,
    );
  }
  if (filtros.notaId) {
    condiciones.push(
      sql`exists (select 1 from ${schema.fichaNota} fn
                  where fn.ficha_id = ${p.fichaId} and fn.nota_id = ${filtros.notaId})`,
    );
  }
  if (filtros.contextoId) {
    condiciones.push(
      sql`exists (select 1 from ${schema.perfumeContexto} pc
                  where pc.perfume_id = ${p.id} and pc.contexto_id = ${filtros.contextoId})`,
    );
  }
  if (filtros.estacion) {
    condiciones.push(
      sql`exists (select 1 from ${schema.perfumeEstacion} pe
                  where pe.perfume_id = ${p.id} and pe.estacion = ${filtros.estacion})`,
    );
  }
  if (filtros.momento) {
    condiciones.push(
      sql`exists (select 1 from ${schema.perfumeMomento} pm
                  where pm.perfume_id = ${p.id} and pm.momento = ${filtros.momento})`,
    );
  }

  const orden = {
    nombre: asc(f.nombre),
    marca: asc(f.marca),
    'ultimo-uso': sql`${agregados.ultimoUso} desc nulls last`,
    'mas-usado': sql`${agregados.vecesUsado} desc nulls last`,
  }[filtros.orden ?? 'nombre'];

  return db
    .select({
      id: p.id,
      nombre: f.nombre,
      marca: f.marca,
      estado: p.estado,
      archivado: p.archivado,
      valoracion: p.valoracion,
      concentracion: f.concentracion,
      vecesUsado: agregados.vecesUsado,
      ultimoUso: agregados.ultimoUso,
    })
    .from(p)
    .innerJoin(f, eq(f.id, p.fichaId))
    .leftJoin(agregados, eq(agregados.perfumeId, p.id))
    .where(and(...condiciones))
    .orderBy(orden);
}

/** Marcas distintas, para el desplegable de filtros. */
export async function marcasDeLaColeccion(userId: string): Promise<string[]> {
  const db = crearDb();
  const filas = await db
    .selectDistinct({ marca: schema.ficha.marca })
    .from(schema.perfume)
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .where(eq(schema.perfume.userId, userId))
    .orderBy(asc(schema.ficha.marca));
  return filas.map((f) => f.marca);
}

/* ------------------------------------------------------------------ ficha */

export async function fichaDePerfume(userId: string, perfumeId: string) {
  const db = crearDb();
  const [fila] = await db
    .select({ frasco: schema.perfume, ficha: schema.ficha })
    .from(schema.perfume)
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, perfumeId)))
    .limit(1);
  if (!fila) return null;
  const fichaId = fila.ficha.id;
  // Frasco y ficha en un solo objeto: las pantallas no tienen por que saber
  // que parte es de todos y que parte es solo mia.
  const perfume = {
    ...fila.frasco,
    nombre: fila.ficha.nombre,
    marca: fila.ficha.marca,
    concentracion: fila.ficha.concentracion,
    anioLanzamiento: fila.ficha.anioLanzamiento,
    fragranticaUrl: fila.ficha.fragranticaUrl,
  };

  const [notas, familias, marcas, promedios, historial, [compartida]] = await Promise.all([
    db
      .select({
        id: schema.nota.id,
        nombre: schema.nota.nombre,
        nivel: schema.fichaNota.nivel,
        orden: schema.fichaNota.orden,
      })
      .from(schema.fichaNota)
      .innerJoin(schema.nota, eq(schema.nota.id, schema.fichaNota.notaId))
      .where(eq(schema.fichaNota.fichaId, fichaId))
      .orderBy(asc(schema.fichaNota.orden)),
    db
      .select({
        id: schema.familia.id,
        nombre: schema.familia.nombre,
        orden: schema.fichaFamilia.orden,
      })
      .from(schema.fichaFamilia)
      .innerJoin(schema.familia, eq(schema.familia.id, schema.fichaFamilia.familiaId))
      .where(eq(schema.fichaFamilia.fichaId, fichaId))
      .orderBy(asc(schema.fichaFamilia.orden)),
    marcasDePerfume([perfumeId]),
    promediosDePerfume(userId, perfumeId),
    historialDePerfume(userId, perfumeId),
    db
      .select({ personas: sql<number>`count(distinct ${schema.perfume.userId})::int` })
      .from(schema.perfume)
      .where(and(eq(schema.perfume.fichaId, fichaId), ne(schema.perfume.userId, userId))),
  ]);

  const [frecuentes] = await db
    .select({
      contextoMasFrecuente: sql<string | null>`mode() within group (order by ${schema.uso.contextoId})`,
      estacionMasFrecuente: sql<Estacion | null>`mode() within group (order by ${schema.uso.estacionEfectiva})`,
    })
    .from(schema.uso)
    .where(and(eq(schema.uso.userId, userId), eq(schema.uso.perfumeId, perfumeId)));

  return {
    perfume,
    /** Cuantas personas mas tienen este perfume, y veran lo que se cambie en la ficha. */
    compartidaCon: compartida?.personas ?? 0,
    notas,
    familias,
    contextos: marcas.contextos.get(perfumeId) ?? [],
    estaciones: marcas.estaciones.get(perfumeId) ?? [],
    momentos: marcas.momentos.get(perfumeId) ?? [],
    promedios,
    historial,
    contextoMasFrecuente: frecuentes?.contextoMasFrecuente ?? null,
    estacionMasFrecuente: frecuentes?.estacionMasFrecuente ?? null,
  };
}

export async function historialDePerfume(userId: string, perfumeId: string) {
  const db = crearDb();
  return db
    .select({
      id: schema.uso.id,
      fecha: schema.uso.fecha,
      momento: schema.uso.momento,
      contextoId: schema.uso.contextoId,
      contexto: schema.contexto.nombre,
      sprays: schema.uso.sprays,
      duracionPercibida: schema.uso.duracionPercibida,
      valoracionDia: schema.uso.valoracionDia,
      idoneidadPct: schema.uso.idoneidadPct,
      idoneidadDetalle: schema.uso.idoneidadDetalle,
      estacionEfectiva: schema.uso.estacionEfectiva,
      comentario: schema.uso.comentario,
    })
    .from(schema.uso)
    .innerJoin(schema.contexto, eq(schema.contexto.id, schema.uso.contextoId))
    .where(and(eq(schema.uso.userId, userId), eq(schema.uso.perfumeId, perfumeId)))
    .orderBy(desc(schema.uso.fecha), desc(schema.uso.creadoEn));
}

/* -------------------------------------------------- vocabulario y wishlist */

export async function listarNotas() {
  const db = crearDb();
  return db.select().from(schema.nota).orderBy(asc(schema.nota.nombre));
}

export async function listarFamilias() {
  const db = crearDb();
  return db.select().from(schema.familia).orderBy(asc(schema.familia.nombre));
}

export async function listarWishlist(userId: string, orden: 'prioridad' | 'antiguedad' = 'prioridad') {
  const db = crearDb();
  const w = schema.wishlist;
  // El enum esta declarado de menos a mas urgente, asi que para ordenar por
  // prioridad hay que ir al reves.
  const criterio =
    orden === 'prioridad'
      ? sql`case ${w.prioridad}
              when 'LO_NECESITO' then 0 when 'LO_QUIERO' then 1 else 2 end, ${w.creadoEn} asc`
      : asc(w.creadoEn);
  return db.select().from(w).where(eq(w.userId, userId)).orderBy(criterio);
}

/* --------------------------------------------------------------- catalogo */

/**
 * Fichas del catalogo comun que encajan con lo escrito, para no dar de alta
 * dos veces lo que otra persona ya ha metido. Dice ademas si ya lo tengo, que
 * es el aviso de duplicado de la seccion 4.1.
 */
export async function buscarEnCatalogo(userId: string, texto: string, limite = 6) {
  const consulta = normalizar(texto);
  if (consulta.length < MINIMO_CARACTERES_BUSQUEDA) return [];
  const db = crearDb();
  const f = schema.ficha;
  const p = schema.perfume;
  return db
    .select({
      id: f.id,
      nombre: f.nombre,
      marca: f.marca,
      concentracion: f.concentracion,
      anioLanzamiento: f.anioLanzamiento,
      // Calificado a mano: sin joins, Drizzle escribe las columnas sin tabla y
      // dentro de la subconsulta "id" seria el del perfume, no el de la ficha.
      /** El frasco propio con esta ficha, si ya lo tengo. */
      miPerfumeId: sql<string | null>`(
        select fr.id from ${p} fr
        where fr.ficha_id = ${f}.id and fr.user_id = ${userId}
        order by fr.creado_en limit 1
      )`,
      personas: sql<number>`(
        select count(distinct fr.user_id)::int from ${p} fr where fr.ficha_id = ${f}.id
      )`,
    })
    .from(f)
    .where(ilike(f.busquedaNormalizada, `%${consulta}%`))
    .orderBy(asc(f.nombre), asc(f.marca))
    .limit(limite);
}

/** La ficha que se comparte desde Fragrantica, si alguien la tiene ya. */
export async function fichaPorUrl(url: string) {
  const db = crearDb();
  const [fila] = await db
    .select({ id: schema.ficha.id })
    .from(schema.ficha)
    .where(eq(schema.ficha.fragranticaUrl, url.trim()))
    .limit(1);
  return fila?.id ?? null;
}

/** Mi frasco de esa ficha, si ya lo tengo. */
export async function miFrascoDeFicha(userId: string, fichaId: string) {
  const db = crearDb();
  const [fila] = await db
    .select({ id: schema.perfume.id })
    .from(schema.perfume)
    .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.fichaId, fichaId)))
    .orderBy(asc(schema.perfume.creadoEn))
    .limit(1);
  return fila?.id ?? null;
}

/**
 * Todo lo necesario para dar de alta un frasco desde una ficha del catalogo.
 *
 * Las estaciones y los momentos son personales, pero para no empezar de cero
 * se proponen los de quien la dio de alta primero. Los contextos no: son de
 * cada cuenta y no se pueden trasladar.
 */
export async function fichaParaAlta(fichaId: string) {
  const db = crearDb();
  const [ficha] = await db.select().from(schema.ficha).where(eq(schema.ficha.id, fichaId)).limit(1);
  if (!ficha) return null;

  const [notas, familias, [primero]] = await Promise.all([
    db
      .select({ nombre: schema.nota.nombre, nivel: schema.fichaNota.nivel })
      .from(schema.fichaNota)
      .innerJoin(schema.nota, eq(schema.nota.id, schema.fichaNota.notaId))
      .where(eq(schema.fichaNota.fichaId, fichaId))
      .orderBy(asc(schema.fichaNota.orden)),
    db
      .select({ id: schema.fichaFamilia.familiaId })
      .from(schema.fichaFamilia)
      .where(eq(schema.fichaFamilia.fichaId, fichaId))
      .orderBy(asc(schema.fichaFamilia.orden)),
    db
      .select({ id: schema.perfume.id })
      .from(schema.perfume)
      .where(eq(schema.perfume.fichaId, fichaId))
      .orderBy(asc(schema.perfume.creadoEn))
      .limit(1),
  ]);
  const marcas = await marcasDePerfume(primero ? [primero.id] : []);

  return {
    id: ficha.id,
    nombre: ficha.nombre,
    marca: ficha.marca,
    concentracion: ficha.concentracion,
    anioLanzamiento: ficha.anioLanzamiento,
    fragranticaUrl: ficha.fragranticaUrl,
    notas,
    familiaIds: familias.map((f) => f.id),
    estaciones: primero ? (marcas.estaciones.get(primero.id) ?? []) : [],
    momentos: primero ? (marcas.momentos.get(primero.id) ?? []) : [],
  };
}

export type FichaParaAlta = NonNullable<Awaited<ReturnType<typeof fichaParaAlta>>>;
