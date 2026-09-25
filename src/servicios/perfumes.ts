/**
 * Alta y edicion de perfumes (seccion 4.1).
 *
 * Un perfume de la coleccion son dos cosas:
 *  - su ficha, comun a todas las cuentas: nombre, marca, concentracion, anio,
 *    URL de Fragrantica, piramide y familias. Se da de alta una vez y el resto
 *    la encuentra hecha.
 *  - el frasco de cada uno (`perfume`): estado, valoracion, volumen, compra,
 *    notas personales, y sus contextos, estaciones y momentos, que son juicio
 *    propio y son lo que mueve la recomendacion.
 *
 * Las cardinalidades minimas —al menos un contexto, una estacion y un momento—
 * se validan aqui, porque son reglas que una tabla hija no puede imponer por si
 * sola. Las notas nuevas se crean al vuelo, deduplicando por nombre normalizado.
 */
import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import { claveBusqueda, normalizar } from '@/dominio/texto';
import type { Estacion, Momento } from '@/dominio/tipos';

export interface NotaDeEntrada {
  nombre: string;
  nivel: 'SALIDA' | 'CORAZON' | 'FONDO';
  orden?: number;
}

type Concentracion = 'EDC' | 'EDT' | 'EDP' | 'EXTRAIT' | 'PARFUM' | 'ACEITE' | 'OTRO';

export interface DatosPerfume {
  /**
   * La ficha del catalogo que se ha elegido al dar de alta. Con ella, lo que
   * venga en los campos de ficha la actualiza: es lo que el usuario tenia
   * delante en el formulario.
   */
  fichaId?: string | null;
  nombre: string;
  marca: string;
  concentracion?: Concentracion | null;
  anioLanzamiento?: number | null;
  volumenMl?: number | null;
  fechaCompra?: string | null;
  estado: 'LO_TENGO' | 'LO_TUVE';
  valoracion?: number | null;
  notasPersonales?: string | null;
  fragranticaUrl?: string | null;
  notas: NotaDeEntrada[];
  familiaIds: string[];
  contextoIds: string[];
  estaciones: Estacion[];
  momentos: Momento[];
}

/** Lo que describe el perfume, comun a todas las cuentas. */
export type DatosFicha = Pick<
  DatosPerfume,
  'nombre' | 'marca' | 'concentracion' | 'anioLanzamiento' | 'fragranticaUrl' | 'notas' | 'familiaIds'
>;

export class ErrorValidacion extends Error {}

/**
 * Las cardinalidades minimas valen para todas las vias de alta, incluida la
 * importacion CSV: un perfume a medio categorizar no sirve para el motor de
 * recomendacion.
 */
function validar(datos: DatosPerfume): void {
  if (!datos.nombre.trim()) throw new ErrorValidacion('El nombre es obligatorio.');
  if (!datos.marca.trim()) throw new ErrorValidacion('La marca es obligatoria.');
  if (datos.contextoIds.length === 0) {
    throw new ErrorValidacion('Marca al menos un contexto.');
  }
  if (datos.estaciones.length === 0) throw new ErrorValidacion('Marca al menos una estación.');
  if (datos.momentos.length === 0) throw new ErrorValidacion('Marca al menos un momento del día.');
}

/**
 * Los contextos son de cada usuario. La clave ajena de `perfume_contexto` solo
 * exige que existan, asi que sin esto se podria colgar un perfume de un
 * contexto de otra cuenta.
 */
async function comprobarContextos(userId: string, contextoIds: string[]): Promise<void> {
  const unicos = [...new Set(contextoIds)];
  const db = crearDb();
  const mios = await db
    .select({ id: schema.contexto.id })
    .from(schema.contexto)
    .where(and(eq(schema.contexto.userId, userId), inArray(schema.contexto.id, unicos)));
  if (mios.length !== unicos.length) throw new ErrorValidacion('Contexto no encontrado.');
}

/**
 * Devuelve los ids de las notas, creando las que no existan.
 * La deduplicacion es por `nombre_normalizado`, asi que "Ámbar" y "ambar" son
 * la misma nota y la estadistica por nota no se parte en dos.
 */
async function resolverNotas(nombres: string[]): Promise<Map<string, string>> {
  const db = crearDb();
  const normalizados = [...new Set(nombres.map(normalizar).filter(Boolean))];
  if (normalizados.length === 0) return new Map();

  const nuevas = nombres
    .map((nombre) => ({ nombre: nombre.trim(), nombreNormalizado: normalizar(nombre) }))
    .filter((n, i, lista) => n.nombreNormalizado && lista.findIndex((o) => o.nombreNormalizado === n.nombreNormalizado) === i);

  await db.insert(schema.nota).values(nuevas).onConflictDoNothing({
    target: schema.nota.nombreNormalizado,
  });

  const filas = await db
    .select({ id: schema.nota.id, normalizado: schema.nota.nombreNormalizado })
    .from(schema.nota)
    .where(inArray(schema.nota.nombreNormalizado, normalizados));

  return new Map(filas.map((f) => [f.normalizado, f.id]));
}

/* ------------------------------------------------------------------ ficha */

/** Lo que se guarda en la fila `ficha`, sin la piramide ni las familias. */
function camposFicha(datos: DatosFicha) {
  return {
    nombre: datos.nombre.trim(),
    marca: datos.marca.trim(),
    busquedaNormalizada: claveBusqueda(datos.nombre, datos.marca),
    concentracion: datos.concentracion ?? null,
    anioLanzamiento: datos.anioLanzamiento ?? null,
    fragranticaUrl: datos.fragranticaUrl ?? null,
  };
}

/** La ficha con el mismo nombre, marca y concentracion, si ya existe. */
async function fichaConLaMismaClave(datos: DatosFicha): Promise<string | null> {
  const { busquedaNormalizada, concentracion } = camposFicha(datos);
  const db = crearDb();
  const [fila] = await db
    .select({ id: schema.ficha.id })
    .from(schema.ficha)
    .where(
      and(
        eq(schema.ficha.busquedaNormalizada, busquedaNormalizada),
        concentracion
          ? eq(schema.ficha.concentracion, concentracion)
          : isNull(schema.ficha.concentracion),
      ),
    )
    .limit(1);
  return fila?.id ?? null;
}

/** Reescribe la piramide y las familias de una ficha. Siempre a la vez. */
async function sincronizarFicha(fichaId: string, datos: DatosFicha): Promise<void> {
  const db = crearDb();
  const notas = await resolverNotas(datos.notas.map((n) => n.nombre));

  await Promise.all([
    db.delete(schema.fichaNota).where(eq(schema.fichaNota.fichaId, fichaId)),
    db.delete(schema.fichaFamilia).where(eq(schema.fichaFamilia.fichaId, fichaId)),
  ]);

  const filasNota = datos.notas
    .map((n, i) => {
      const notaId = notas.get(normalizar(n.nombre));
      return notaId ? { fichaId, notaId, nivel: n.nivel, orden: n.orden ?? i } : null;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    // Un perfume puede repetir la misma nota en dos niveles, pero no dos veces
    // en el mismo: la clave primaria lo rechazaria.
    .filter(
      (f, i, lista) => lista.findIndex((o) => o.notaId === f.notaId && o.nivel === f.nivel) === i,
    );
  const familiaIds = [...new Set(datos.familiaIds)];

  await Promise.all([
    filasNota.length ? db.insert(schema.fichaNota).values(filasNota) : null,
    familiaIds.length
      ? db
          .insert(schema.fichaFamilia)
          .values(familiaIds.map((familiaId, orden) => ({ fichaId, familiaId, orden })))
      : null,
  ]);
}

/**
 * Sobre una ficha que ya tenia otra persona, solo se rellena lo que falte.
 *
 * Es lo que pasa al dar de alta a mano, o importar un CSV, algo que ya estaba
 * en el catalogo sin haberlo elegido de la lista: quien lo escribe no ha visto
 * la ficha, y pisarla podria dejar sin notas a los demas.
 */
async function completarFicha(fichaId: string, datos: DatosFicha): Promise<void> {
  const db = crearDb();
  const { anioLanzamiento, fragranticaUrl } = camposFicha(datos);
  await db
    .update(schema.ficha)
    .set({
      anioLanzamiento: sql`coalesce(${schema.ficha.anioLanzamiento}, ${anioLanzamiento})`,
      fragranticaUrl: sql`coalesce(${schema.ficha.fragranticaUrl}, ${fragranticaUrl})`,
    })
    .where(eq(schema.ficha.id, fichaId));

  const [tiene] = await db
    .select({
      notas: sql<number>`(select count(*)::int from ${schema.fichaNota} where ficha_id = ${fichaId})`,
      familias: sql<number>`(select count(*)::int from ${schema.fichaFamilia} where ficha_id = ${fichaId})`,
    })
    .from(schema.ficha)
    .where(eq(schema.ficha.id, fichaId));
  const faltaPiramide = (tiene?.notas ?? 0) === 0 && datos.notas.length > 0;
  const faltanFamilias = (tiene?.familias ?? 0) === 0 && datos.familiaIds.length > 0;
  if (!faltaPiramide && !faltanFamilias) return;

  // `sincronizarFicha` reescribe las dos cosas: lo que ya hubiera se conserva.
  const actuales = await leerPiramideYFamilias(fichaId);
  await sincronizarFicha(fichaId, {
    ...datos,
    notas: faltaPiramide ? datos.notas : actuales.notas,
    familiaIds: faltanFamilias ? datos.familiaIds : actuales.familiaIds,
  });
}

async function leerPiramideYFamilias(fichaId: string) {
  const db = crearDb();
  const [notas, familias] = await Promise.all([
    db
      .select({ nombre: schema.nota.nombre, nivel: schema.fichaNota.nivel, orden: schema.fichaNota.orden })
      .from(schema.fichaNota)
      .innerJoin(schema.nota, eq(schema.nota.id, schema.fichaNota.notaId))
      .where(eq(schema.fichaNota.fichaId, fichaId))
      .orderBy(schema.fichaNota.orden),
    db
      .select({ id: schema.fichaFamilia.familiaId })
      .from(schema.fichaFamilia)
      .where(eq(schema.fichaFamilia.fichaId, fichaId))
      .orderBy(schema.fichaFamilia.orden),
  ]);
  return { notas, familiaIds: familias.map((f) => f.id) };
}

const esClaveRepetida = (error: unknown) => (error as { code?: string })?.code === '23505';

/**
 * Sobrescribe una ficha con lo del formulario.
 *
 * Si el nuevo nombre, marca y concentracion ya son de otra ficha, devuelve esa
 * otra en vez de fallar: quien corrige "EDT" por "EDP" quiere su frasco en la
 * ficha del EDP, no un error.
 */
async function sobrescribirFicha(fichaId: string, datos: DatosFicha): Promise<string> {
  const otra = await fichaConLaMismaClave(datos);
  if (otra && otra !== fichaId) return otra;

  const db = crearDb();
  try {
    await db
      .update(schema.ficha)
      .set({ ...camposFicha(datos), actualizadoEn: new Date() })
      .where(eq(schema.ficha.id, fichaId));
  } catch (error) {
    // Alguien ha creado esa misma ficha entre la comprobacion y el update.
    if (esClaveRepetida(error)) {
      const creada = await fichaConLaMismaClave(datos);
      if (creada) return creada;
    }
    throw error;
  }
  await sincronizarFicha(fichaId, datos);
  return fichaId;
}

/**
 * Busca la ficha por su clave y, si no existe, la crea. Si existe solo rellena
 * lo que le falte. Es la via del alta a mano, del CSV y de las copias.
 */
export async function resolverFicha(userId: string, datos: DatosFicha): Promise<string> {
  const existente = await fichaConLaMismaClave(datos);
  if (existente) {
    await completarFicha(existente, datos);
    return existente;
  }

  const db = crearDb();
  const [creada] = await db
    .insert(schema.ficha)
    .values({ ...camposFicha(datos), creadaPor: userId })
    // Carrera con otra alta de la misma ficha: gana la primera.
    .onConflictDoNothing()
    .returning({ id: schema.ficha.id });
  if (!creada) {
    const ganadora = await fichaConLaMismaClave(datos);
    if (!ganadora) throw new Error('No se pudo crear la ficha.');
    await completarFicha(ganadora, datos);
    return ganadora;
  }
  await sincronizarFicha(creada.id, datos);
  return creada.id;
}

/** Una ficha sin ningun frasco que ha dejado de hacer falta tras moverlo. */
async function borrarFichaSiHuerfana(fichaId: string): Promise<void> {
  const db = crearDb();
  await db
    .delete(schema.ficha)
    .where(
      and(
        eq(schema.ficha.id, fichaId),
        sql`not exists (select 1 from ${schema.perfume} where ${schema.perfume.fichaId} = ${fichaId})`,
      ),
    );
}

/* ----------------------------------------------------------------- frasco */

/** Reescribe las tres tablas personales de un frasco. Siempre a la vez. */
async function sincronizarFrasco(perfumeId: string, datos: DatosPerfume): Promise<void> {
  const db = crearDb();
  await Promise.all([
    db.delete(schema.perfumeContexto).where(eq(schema.perfumeContexto.perfumeId, perfumeId)),
    db.delete(schema.perfumeEstacion).where(eq(schema.perfumeEstacion.perfumeId, perfumeId)),
    db.delete(schema.perfumeMomento).where(eq(schema.perfumeMomento.perfumeId, perfumeId)),
  ]);
  await Promise.all([
    db
      .insert(schema.perfumeContexto)
      .values([...new Set(datos.contextoIds)].map((contextoId) => ({ perfumeId, contextoId }))),
    db
      .insert(schema.perfumeEstacion)
      .values([...new Set(datos.estaciones)].map((estacion) => ({ perfumeId, estacion }))),
    db
      .insert(schema.perfumeMomento)
      .values([...new Set(datos.momentos)].map((momento) => ({ perfumeId, momento }))),
  ]);
}

function camposFrasco(datos: DatosPerfume) {
  return {
    volumenMl: datos.volumenMl ?? null,
    fechaCompra: datos.fechaCompra ?? null,
    estado: datos.estado,
    valoracion: datos.valoracion ?? null,
    notasPersonales: datos.notasPersonales ?? null,
  };
}

export async function crearPerfume(userId: string, datos: DatosPerfume): Promise<string> {
  validar(datos);
  await comprobarContextos(userId, datos.contextoIds);

  let fichaId: string;
  if (datos.fichaId) {
    const db = crearDb();
    const [elegida] = await db
      .select({ id: schema.ficha.id })
      .from(schema.ficha)
      .where(eq(schema.ficha.id, datos.fichaId))
      .limit(1);
    if (!elegida) throw new ErrorValidacion('Esa ficha ya no existe.');
    fichaId = await sobrescribirFicha(elegida.id, datos);
  } else {
    fichaId = await resolverFicha(userId, datos);
  }

  const db = crearDb();
  const [creado] = await db
    .insert(schema.perfume)
    .values({ userId, fichaId, ...camposFrasco(datos) })
    .returning({ id: schema.perfume.id });

  if (!creado) throw new Error('No se pudo crear el perfume.');
  await sincronizarFrasco(creado.id, datos);
  return creado.id;
}

/**
 * Edita el frasco y su ficha. La ficha es de todos: corregir una nota aqui la
 * corrige para cualquiera que tenga el perfume, y es lo que se quiere en un
 * grupo que se fia de lo que da de alta.
 */
export async function actualizarPerfume(
  userId: string,
  perfumeId: string,
  datos: DatosPerfume,
): Promise<void> {
  validar(datos);
  await comprobarContextos(userId, datos.contextoIds);
  const db = crearDb();

  const actualizadas = await db
    .update(schema.perfume)
    .set({ ...camposFrasco(datos), actualizadoEn: new Date() })
    .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, perfumeId)))
    .returning({ id: schema.perfume.id, fichaId: schema.perfume.fichaId });

  const frasco = actualizadas[0];
  if (!frasco) throw new ErrorValidacion('Perfume no encontrado.');

  const fichaFinal = await sobrescribirFicha(frasco.fichaId, datos);
  if (fichaFinal !== frasco.fichaId) {
    await db
      .update(schema.perfume)
      .set({ fichaId: fichaFinal })
      .where(eq(schema.perfume.id, perfumeId));
    await borrarFichaSiHuerfana(frasco.fichaId);
  }
  await sincronizarFrasco(perfumeId, datos);
}

/**
 * Regla dura: un perfume nunca se borra, se archiva. No hay funcion de borrado
 * en todo el servicio, y la clave ajena de `uso` lo respalda en la base de datos.
 */
export async function archivarPerfume(
  userId: string,
  perfumeId: string,
  archivado: boolean,
): Promise<void> {
  const db = crearDb();
  await db
    .update(schema.perfume)
    .set({ archivado, actualizadoEn: new Date() })
    .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, perfumeId)));
}

/** Marcar LO_TUVE saca de recomendaciones pero no toca el historico (4.2). */
export async function cambiarEstado(
  userId: string,
  perfumeId: string,
  estado: 'LO_TENGO' | 'LO_TUVE',
): Promise<void> {
  const db = crearDb();
  await db
    .update(schema.perfume)
    .set({ estado, actualizadoEn: new Date() })
    .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, perfumeId)));
}
