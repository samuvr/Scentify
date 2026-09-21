/**
 * Alta y edicion de perfumes (seccion 4.1).
 *
 * Las cardinalidades minimas —al menos un contexto, una estacion y un momento—
 * se validan aqui, porque son reglas que una tabla hija no puede imponer por si
 * sola. Las notas nuevas se crean al vuelo, deduplicando por nombre normalizado.
 */
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import { claveBusqueda, normalizar } from '@/dominio/texto';
import type { Estacion, Momento } from '@/dominio/tipos';

export interface NotaDeEntrada {
  nombre: string;
  nivel: 'SALIDA' | 'CORAZON' | 'FONDO';
  orden?: number;
}

export interface DatosPerfume {
  nombre: string;
  marca: string;
  concentracion?: 'EDC' | 'EDT' | 'EDP' | 'EXTRAIT' | 'PARFUM' | 'ACEITE' | 'OTRO' | null;
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

/** Reescribe las cinco tablas hijas de un perfume. Siempre a la vez. */
async function sincronizarRelaciones(perfumeId: string, datos: DatosPerfume): Promise<void> {
  const db = crearDb();
  const notas = await resolverNotas(datos.notas.map((n) => n.nombre));

  await Promise.all([
    db.delete(schema.perfumeNota).where(eq(schema.perfumeNota.perfumeId, perfumeId)),
    db.delete(schema.perfumeFamilia).where(eq(schema.perfumeFamilia.perfumeId, perfumeId)),
    db.delete(schema.perfumeContexto).where(eq(schema.perfumeContexto.perfumeId, perfumeId)),
    db.delete(schema.perfumeEstacion).where(eq(schema.perfumeEstacion.perfumeId, perfumeId)),
    db.delete(schema.perfumeMomento).where(eq(schema.perfumeMomento.perfumeId, perfumeId)),
  ]);

  const filasNota = datos.notas
    .map((n, i) => {
      const notaId = notas.get(normalizar(n.nombre));
      return notaId ? { perfumeId, notaId, nivel: n.nivel, orden: n.orden ?? i } : null;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    // Un perfume puede repetir la misma nota en dos niveles, pero no dos veces
    // en el mismo: la clave primaria lo rechazaria.
    .filter(
      (f, i, lista) => lista.findIndex((o) => o.notaId === f.notaId && o.nivel === f.nivel) === i,
    );

  await Promise.all([
    filasNota.length ? db.insert(schema.perfumeNota).values(filasNota) : null,
    datos.familiaIds.length
      ? db
          .insert(schema.perfumeFamilia)
          .values(datos.familiaIds.map((familiaId, orden) => ({ perfumeId, familiaId, orden })))
      : null,
    db
      .insert(schema.perfumeContexto)
      .values(datos.contextoIds.map((contextoId) => ({ perfumeId, contextoId }))),
    db
      .insert(schema.perfumeEstacion)
      .values(datos.estaciones.map((estacion) => ({ perfumeId, estacion }))),
    db.insert(schema.perfumeMomento).values(datos.momentos.map((momento) => ({ perfumeId, momento }))),
  ]);
}

export async function crearPerfume(userId: string, datos: DatosPerfume): Promise<string> {
  validar(datos);
  const db = crearDb();

  const [creado] = await db
    .insert(schema.perfume)
    .values({
      userId,
      nombre: datos.nombre.trim(),
      marca: datos.marca.trim(),
      busquedaNormalizada: claveBusqueda(datos.nombre, datos.marca),
      concentracion: datos.concentracion ?? null,
      anioLanzamiento: datos.anioLanzamiento ?? null,
      volumenMl: datos.volumenMl ?? null,
      fechaCompra: datos.fechaCompra ?? null,
      estado: datos.estado,
      valoracion: datos.valoracion ?? null,
      notasPersonales: datos.notasPersonales ?? null,
      fragranticaUrl: datos.fragranticaUrl ?? null,
    })
    .returning({ id: schema.perfume.id });

  if (!creado) throw new Error('No se pudo crear el perfume.');
  await sincronizarRelaciones(creado.id, datos);
  return creado.id;
}

export async function actualizarPerfume(
  userId: string,
  perfumeId: string,
  datos: DatosPerfume,
): Promise<void> {
  validar(datos);
  const db = crearDb();

  const actualizadas = await db
    .update(schema.perfume)
    .set({
      nombre: datos.nombre.trim(),
      marca: datos.marca.trim(),
      busquedaNormalizada: claveBusqueda(datos.nombre, datos.marca),
      concentracion: datos.concentracion ?? null,
      anioLanzamiento: datos.anioLanzamiento ?? null,
      volumenMl: datos.volumenMl ?? null,
      fechaCompra: datos.fechaCompra ?? null,
      estado: datos.estado,
      valoracion: datos.valoracion ?? null,
      notasPersonales: datos.notasPersonales ?? null,
      fragranticaUrl: datos.fragranticaUrl ?? null,
      actualizadoEn: new Date(),
    })
    .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, perfumeId)))
    .returning({ id: schema.perfume.id });

  if (actualizadas.length === 0) throw new ErrorValidacion('Perfume no encontrado.');
  await sincronizarRelaciones(perfumeId, datos);
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
