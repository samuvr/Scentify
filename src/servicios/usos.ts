/**
 * Registro de usos: el punto donde se juntan la logica pura y la base de datos.
 *
 * Aqui se decide la estacion efectiva (7.1) y se calcula la idoneidad (6.2), y
 * ambas se guardan como snapshot. A partir de ese momento el registro es
 * inmutable en esos dos campos: cambiar los contextos del perfume no altera el
 * historico (criterio 10).
 */
import 'server-only';
import { after } from 'next/server';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { crearDb, enUnaTransaccion, schema } from '@/db';
import { calcularIdoneidad, type Idoneidad } from '@/dominio/idoneidad';
import {
  calcularEstacionEfectiva,
  type ResultadoEstacionEfectiva,
} from '@/dominio/estacion';
import type { DuracionPercibida, Estacion, Momento } from '@/dominio/tipos';
import { leerConfiguracion } from './ajustes';
import { obtenerClima } from './clima';
import { marcasParaIdoneidad } from './consultas';
import { ErrorValidacion } from './perfumes';
import { fechaEnZona, ZONA_POR_DEFECTO } from '@/dominio/zona';

/**
 * Fecha de hoy en 'YYYY-MM-DD', en la zona horaria del usuario. Las pantallas
 * la pasan con `zonaDelUsuario()`; sin zona, la de la app.
 */
export function hoyIso(zona = ZONA_POR_DEFECTO): string {
  return fechaEnZona(zona);
}

/**
 * Momento del dia que toca ahora mismo, como valor por defecto del registro:
 * a partir de las 18:00 (y de madrugada) es de noche.
 */
export function momentoDeAhora(zona = ZONA_POR_DEFECTO): Momento {
  const hora = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', hourCycle: 'h23' }).format(
      new Date(),
    ),
  );
  return hora >= 18 || hora < 5 ? 'NOCHE' : 'DIA';
}

/** Sabado o domingo, para una fecha 'YYYY-MM-DD'. */
export function esFinDeSemana(iso: string): boolean {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

export function desplazarDias(iso: string, dias: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Estacion efectiva de una fecha y un momento concretos.
 *
 * Para una fecha pasada se usa el tiempo que hizo ese dia, no el de hoy; para
 * mañana, su prevision. Si no
 * hay forma de saberlo, se cae al calendario y el resultado lo dice.
 */
export async function estacionEfectivaDe(
  userId: string,
  fecha: string,
  momento: Momento,
  nombreDia?: string,
  opciones: { esperaMaximaMs?: number } = {},
): Promise<ResultadoEstacionEfectiva> {
  const { ubicacion, umbrales } = await leerConfiguracion(userId);
  const clima = await climaSinBloquear(ubicacion, fecha, opciones.esperaMaximaMs);
  return calcularEstacionEfectiva({
    fecha,
    momento,
    clima,
    umbrales,
    etiquetaUbicacion: ubicacion.etiqueta,
    nombreDia,
  });
}

/**
 * El tiempo del dia sin dejar que Open-Meteo frene la pantalla. La primera
 * apertura del dia tenia que esperar a su respuesta (hasta 6 s con mala
 * suerte) antes de pintar nada. Con `esperaMaximaMs`, si no ha llegado en ese
 * tiempo, se pinta con el calendario y la consulta sigue en segundo plano:
 * deja el dia en la cache y la siguiente apertura ya lo tiene.
 */
async function climaSinBloquear(
  ubicacion: Parameters<typeof obtenerClima>[0],
  fecha: string,
  esperaMaximaMs?: number,
) {
  const pendiente = obtenerClima(ubicacion, fecha);
  if (!esperaMaximaMs) return pendiente;
  const tarde = Symbol('tarde');
  const ganador = await Promise.race([
    pendiente,
    new Promise<typeof tarde>((resolver) => setTimeout(() => resolver(tarde), esperaMaximaMs)),
  ]);
  if (ganador !== tarde) return ganador;
  try {
    // En Vercel la funcion se congela al responder: `after` la mantiene viva
    // hasta que la consulta termina y se guarda.
    after(() => pendiente.then(() => undefined));
  } catch {
    // Fuera de una peticion (tests, scripts) no hay `after`; la promesa sigue.
  }
  return null;
}

/** Lo que una pantalla espera al tiempo antes de pintar con el calendario. */
export const ESPERA_CLIMA_PANTALLA_MS = 1500;

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
  const { contextoAtemporal } = await comprobarPropiedad(userId, datos.perfumeId, datos.contextoId);
  const estacion = await resolverEstacion(userId, datos);
  const marcas = await marcasParaIdoneidad(datos.perfumeId);
  const idoneidad = calcularIdoneidad(marcas, {
    momento: datos.momento,
    contextoId: datos.contextoId,
    estacionesCompatibles: estacion.estaciones,
    contextoAtemporal,
  });
  return { idoneidad, estacion };
}

/**
 * El perfume y el contexto tienen que ser del usuario de la sesion. Las claves
 * ajenas solo exigen que existan, asi que sin esto se podria apuntar un uso al
 * perfume de otra cuenta y ver su nombre en el historial propio. De paso dice
 * si el contexto es atemporal, que la idoneidad necesita.
 */
async function comprobarPropiedad(
  userId: string,
  perfumeId: string,
  contextoId: string,
): Promise<{ contextoAtemporal: boolean }> {
  const db = crearDb();
  const [perfume, contexto] = await Promise.all([
    db
      .select({ id: schema.perfume.id })
      .from(schema.perfume)
      .where(and(eq(schema.perfume.userId, userId), eq(schema.perfume.id, perfumeId)))
      .limit(1),
    db
      .select({ id: schema.contexto.id, atemporal: schema.contexto.atemporal })
      .from(schema.contexto)
      .where(and(eq(schema.contexto.userId, userId), eq(schema.contexto.id, contextoId)))
      .limit(1),
  ]);
  if (perfume.length === 0) throw new ErrorValidacion('Perfume no encontrado.');
  const [fila] = contexto;
  if (!fila) throw new ErrorValidacion('Contexto no encontrado.');
  return { contextoAtemporal: fila.atemporal };
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

/** La fila que se inserta para un uso, con su snapshot ya calculado. */
async function filaDeUso(userId: string, datos: DatosUso) {
  const { idoneidad, estacion } = await previsualizarIdoneidad(userId, datos);
  const id = datos.id ?? crypto.randomUUID();
  const fila = {
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
    // La temperatura que decidio la estacion, guardada desde ya: el
    // rendimiento segun el tiempo necesita meses de datos para decir algo.
    temperaturaUsada: estacion.temperaturaUsada,
    bochorno: estacion.ajusteBochorno,
  };
  return { id, idoneidad, estacion, fila };
}

export async function registrarUso(userId: string, datos: DatosUso): Promise<ResultadoRegistro> {
  const { id, idoneidad, estacion, fila } = await filaDeUso(userId, datos);
  const db = crearDb();

  const insertadas = await db
    .insert(schema.uso)
    .values(fila)
    // Mismo id = mismo registro: reenviar la cola offline no duplica.
    .onConflictDoNothing({ target: schema.uso.id })
    .returning({ id: schema.uso.id });

  return { id, idoneidad, estacion, yaExistia: insertadas.length === 0 };
}

/**
 * «Ajustar» un registro recien hecho: el viejo se borra y el nuevo entra en
 * la misma transaccion, y solo al confirmar. Antes se borraba al pulsar
 * Ajustar, y salir del formulario sin guardar perdia el uso.
 *
 * Es borrar y crear, no actualizar, porque cambiar perfume, momento o contexto
 * cambia el snapshot de idoneidad, y ese snapshot no se edita nunca.
 */
export async function reemplazarUso(
  userId: string,
  viejoId: string,
  datos: DatosUso,
): Promise<ResultadoRegistro> {
  const { id, idoneidad, estacion, fila } = await filaDeUso(userId, datos);
  await enUnaTransaccion((db) => [
    db.delete(schema.uso).where(and(eq(schema.uso.userId, userId), eq(schema.uso.id, viejoId))),
    db.insert(schema.uso).values(fila).onConflictDoNothing({ target: schema.uso.id }),
  ]);
  return { id, idoneidad, estacion, yaExistia: false };
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
  // Un UPDATE sin columnas no es nada que hacer, y Drizzle lo rechaza.
  if (Object.values(campos).every((valor) => valor === undefined)) return;
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

/** Boton "Otro": descarta la sugerencia durante el resto del dia (o para mañana). */
export async function descartarRecomendacion(
  userId: string,
  perfumeId: string,
  fecha: string,
  para?: { contextoId?: string | null; momento?: Momento | null },
): Promise<void> {
  const db = crearDb();
  // El contexto tiene que ser de la cuenta: es una clave ajena y, sin esto,
  // se podria apuntar un descarte a un contexto ajeno.
  let contextoId: string | null = null;
  if (para?.contextoId) {
    const [propio] = await db
      .select({ id: schema.contexto.id })
      .from(schema.contexto)
      .where(and(eq(schema.contexto.userId, userId), eq(schema.contexto.id, para.contextoId)))
      .limit(1);
    contextoId = propio?.id ?? null;
  }
  await db
    .insert(schema.recomendacionDescarte)
    .values({ userId, perfumeId, fecha, contextoId, momento: para?.momento ?? null })
    .onConflictDoNothing();
}

/** Usos del dia, para la pantalla de inicio. */
export async function usosDelDia(userId: string, fecha: string) {
  const db = crearDb();
  return db
    .select({
      id: schema.uso.id,
      perfumeId: schema.uso.perfumeId,
      nombre: schema.ficha.nombre,
      marca: schema.ficha.marca,
      momento: schema.uso.momento,
      contexto: schema.contexto.nombre,
      sprays: schema.uso.sprays,
      duracionPercibida: schema.uso.duracionPercibida,
      valoracionDia: schema.uso.valoracionDia,
      comentario: schema.uso.comentario,
      idoneidadPct: schema.uso.idoneidadPct,
      idoneidadDetalle: schema.uso.idoneidadDetalle,
      estacionEfectiva: schema.uso.estacionEfectiva,
    })
    .from(schema.uso)
    .innerJoin(schema.perfume, eq(schema.perfume.id, schema.uso.perfumeId))
    .innerJoin(schema.ficha, eq(schema.ficha.id, schema.perfume.fichaId))
    .innerJoin(schema.contexto, eq(schema.contexto.id, schema.uso.contextoId))
    .where(and(eq(schema.uso.userId, userId), eq(schema.uso.fecha, fecha)))
    .orderBy(sql`${schema.uso.creadoEn} desc`);
}

/** Cuantos usos hay apuntados cada dia de un rango, para el calendario. */
export async function usosPorDia(
  userId: string,
  desde: string,
  hasta: string,
): Promise<Map<string, number>> {
  const db = crearDb();
  const filas = await db
    .select({ fecha: schema.uso.fecha, cuantos: sql<number>`count(*)::int` })
    .from(schema.uso)
    .where(
      and(
        eq(schema.uso.userId, userId),
        gte(schema.uso.fecha, desde),
        lte(schema.uso.fecha, hasta),
      ),
    )
    .groupBy(schema.uso.fecha);
  return new Map(filas.map((f) => [f.fecha, Number(f.cuantos)]));
}
