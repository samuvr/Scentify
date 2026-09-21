/**
 * Registro de usos: el punto donde se juntan la logica pura y la base de datos.
 *
 * Aqui se decide la estacion efectiva (7.1) y se calcula la idoneidad (6.2), y
 * ambas se guardan como snapshot. A partir de ese momento el registro es
 * inmutable en esos dos campos: cambiar los contextos del perfume no altera el
 * historico (criterio 10).
 */
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import { calcularIdoneidad, type Idoneidad } from '@/dominio/idoneidad';
import {
  calcularEstacionEfectiva,
  type ResultadoEstacionEfectiva,
} from '@/dominio/estacion';
import type { DuracionPercibida, Estacion, Momento } from '@/dominio/tipos';
import { leerConfiguracion } from './ajustes';
import { obtenerClima } from './clima';
import { marcasParaIdoneidad } from './consultas';

/** Fecha de hoy en 'YYYY-MM-DD', en la zona horaria de la ubicacion del usuario. */
export function hoyIso(zona = 'Europe/Madrid'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date());
}

export function desplazarDias(iso: string, dias: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Estacion efectiva de una fecha y un momento concretos.
 *
 * Para una fecha pasada se usa el tiempo que hizo ese dia, no el de hoy. Si no
 * hay forma de saberlo, se cae al calendario y el resultado lo dice.
 */
export async function estacionEfectivaDe(
  userId: string,
  fecha: string,
  momento: Momento,
): Promise<ResultadoEstacionEfectiva> {
  const { ubicacion, umbrales } = await leerConfiguracion(userId);
  const clima = await obtenerClima(ubicacion, fecha);
  return calcularEstacionEfectiva({
    fecha,
    momento,
    clima,
    umbrales,
    etiquetaUbicacion: ubicacion.etiqueta,
  });
}

export interface DatosUso {
  /** Generado en el cliente: hace idempotente el reenvio de la cola offline. */
  id?: string;
  perfumeId: string;
  fecha: string;
  momento: Momento;
  contextoId: string;
  sprays?: number | null;
  duracionPercibida?: DuracionPercibida | null;
  valoracionDia?: number | null;
  comentario?: string | null;
  /** Sobrescritura manual de la estacion propuesta (siempre permitida, 7.1). */
  estacionesForzadas?: Estacion[];
}

export interface ResultadoRegistro {
  id: string;
  idoneidad: Idoneidad;
  estacion: ResultadoEstacionEfectiva;
  /** true si el registro ya existia: un reenvio de la cola no duplica nada. */
  yaExistia: boolean;
}

/** Calcula idoneidad y estacion sin guardar, para la vista previa del formulario. */
export async function previsualizarIdoneidad(
  userId: string,
  datos: Pick<DatosUso, 'perfumeId' | 'fecha' | 'momento' | 'contextoId' | 'estacionesForzadas'>,
): Promise<{ idoneidad: Idoneidad; estacion: ResultadoEstacionEfectiva }> {
  const estacion = await resolverEstacion(userId, datos);
  const marcas = await marcasParaIdoneidad(datos.perfumeId);
  const idoneidad = calcularIdoneidad(marcas, {
    momento: datos.momento,
    contextoId: datos.contextoId,
    estacionesCompatibles: estacion.estaciones,
  });
  return { idoneidad, estacion };
}

async function resolverEstacion(
  userId: string,
  datos: Pick<DatosUso, 'fecha' | 'momento' | 'estacionesForzadas'>,
): Promise<ResultadoEstacionEfectiva> {
  const forzadas = datos.estacionesForzadas;
  if (forzadas && forzadas.length > 0) {
    const dominante = forzadas[0] as Estacion;
    return {
      estaciones: forzadas,
      dominante,
      origen: 'MANUAL',
      temperaturaUsada: null,
      ajusteBochorno: false,
      explicacion: 'Estación elegida a mano.',
    };
  }
  return estacionEfectivaDe(userId, datos.fecha, datos.momento);
}

export async function registrarUso(userId: string, datos: DatosUso): Promise<ResultadoRegistro> {
  const { idoneidad, estacion } = await previsualizarIdoneidad(userId, datos);
  const db = crearDb();
  const id = datos.id ?? crypto.randomUUID();

  const insertadas = await db
    .insert(schema.uso)
    .values({
      id,
      userId,
      perfumeId: datos.perfumeId,
      fecha: datos.fecha,
      momento: datos.momento,
      contextoId: datos.contextoId,
      sprays: datos.sprays ?? null,
      duracionPercibida: datos.duracionPercibida ?? null,
      valoracionDia: datos.valoracionDia ?? null,
      comentario: datos.comentario?.trim() || null,
      idoneidadPct: idoneidad.pct,
      idoneidadDetalle: idoneidad.detalle,
      estacionEfectiva: estacion.dominante,
      estacionesEfectivas: estacion.estaciones,
      origenEstacion: estacion.origen,
    })
    // Mismo id = mismo registro: reenviar la cola offline no duplica.
    .onConflictDoNothing({ target: schema.uso.id })
    .returning({ id: schema.uso.id });

  return { id, idoneidad, estacion, yaExistia: insertadas.length === 0 };
}

/**
 * Los campos que se rellenan por la noche desde el historial (seccion 6.1).
 * No se toca el snapshot de idoneidad: eso es historia, no una preferencia.
 */
export async function completarUso(
  userId: string,
  usoId: string,
  campos: {
    sprays?: number | null;
    duracionPercibida?: DuracionPercibida | null;
    valoracionDia?: number | null;
    comentario?: string | null;
  },
): Promise<void> {
  const db = crearDb();
  await db
    .update(schema.uso)
    .set(campos)
    .where(and(eq(schema.uso.userId, userId), eq(schema.uso.id, usoId)));
}

export async function borrarUso(userId: string, usoId: string): Promise<void> {
  const db = crearDb();
  await db.delete(schema.uso).where(and(eq(schema.uso.userId, userId), eq(schema.uso.id, usoId)));
}

/** Boton "Otro": descarta la sugerencia durante el resto del dia. */
export async function descartarRecomendacion(
  userId: string,
  perfumeId: string,
  fecha: string,
): Promise<void> {
  const db = crearDb();
  await db
    .insert(schema.recomendacionDescarte)
    .values({ userId, perfumeId, fecha })
    .onConflictDoNothing();
}

/** Usos del dia, para la pantalla de inicio. */
export async function usosDelDia(userId: string, fecha: string) {
  const db = crearDb();
  return db
    .select({
      id: schema.uso.id,
      perfumeId: schema.uso.perfumeId,
      nombre: schema.perfume.nombre,
      marca: schema.perfume.marca,
      momento: schema.uso.momento,
      contexto: schema.contexto.nombre,
      sprays: schema.uso.sprays,
      duracionPercibida: schema.uso.duracionPercibida,
      valoracionDia: schema.uso.valoracionDia,
      idoneidadPct: schema.uso.idoneidadPct,
      idoneidadDetalle: schema.uso.idoneidadDetalle,
      estacionEfectiva: schema.uso.estacionEfectiva,
    })
    .from(schema.uso)
    .innerJoin(schema.perfume, eq(schema.perfume.id, schema.uso.perfumeId))
    .innerJoin(schema.contexto, eq(schema.contexto.id, schema.uso.contextoId))
    .where(and(eq(schema.uso.userId, userId), eq(schema.uso.fecha, fecha)))
    .orderBy(sql`${schema.uso.creadoEn} desc`);
}
