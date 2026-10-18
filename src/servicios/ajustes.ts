/**
 * Lectura y escritura de la tabla `ajuste` (clave-valor).
 *
 * Los umbrales de la seccion 7.1 se editan desde la pantalla de configuracion,
 * asi que nunca se leen de una constante: siempre de aqui, con los valores por
 * defecto del dominio como red de seguridad si falta alguna clave.
 */
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import { headers } from 'next/headers';
import { UMBRALES_POR_DEFECTO, type UmbralesEstacion } from '@/dominio/estacion';
import {
  UBICACION_POR_DEFECTO,
  interpretarAjusteUbicacion,
  ubicacionDesdeCabeceras,
  type Ubicacion,
} from '@/dominio/ubicacion';

export type { Ubicacion };

export interface Configuracion {
  /** La ubicacion ya resuelta: la fija, o la de la conexion en modo automatico. */
  ubicacion: Ubicacion;
  modoUbicacion: 'auto' | 'fija';
  /**
   * En modo automatico, false si la peticion no traia geolocalizacion (fuera
   * de Vercel, en el cron) y se ha caido a la ubicacion por defecto.
   */
  ubicacionDetectada: boolean;
  umbrales: UmbralesEstacion;
}

/** Ubicacion de la peticion en curso, o null si no hay peticion o no la trae. */
async function ubicacionDeLaPeticion(): Promise<Ubicacion | null> {
  try {
    const cabeceras = await headers();
    return ubicacionDesdeCabeceras((nombre) => cabeceras.get(nombre));
  } catch {
    // Fuera de una peticion (scripts, tests) `headers()` lanza.
    return null;
  }
}

const CLAVES_UMBRAL: Record<keyof UmbralesEstacion, string> = {
  umbralVerano: 'umbral_verano',
  umbralVeranoEntretiempo: 'umbral_verano_entretiempo',
  umbralEntretiempo: 'umbral_entretiempo',
  umbralEntretiempoInvierno: 'umbral_entretiempo_invierno',
  bochornoHumedadPct: 'bochorno_humedad_pct',
  bochornoTemperaturaMin: 'bochorno_temperatura_min',
  bochornoIncremento: 'bochorno_incremento',
};

export async function leerConfiguracion(userId: string): Promise<Configuracion> {
  const db = crearDb();
  const filas = await db
    .select({ clave: schema.ajuste.clave, valor: schema.ajuste.valor })
    .from(schema.ajuste)
    .where(eq(schema.ajuste.userId, userId));

  const mapa = new Map(filas.map((f) => [f.clave, f.valor]));

  const umbrales = { ...UMBRALES_POR_DEFECTO };
  for (const [campo, clave] of Object.entries(CLAVES_UMBRAL) as [
    keyof UmbralesEstacion,
    string,
  ][]) {
    const valor = mapa.get(clave);
    if (typeof valor === 'number' && Number.isFinite(valor)) umbrales[campo] = valor;
  }

  // Sin ajuste guardado, automatica: la ubicacion por defecto solo tiene
  // sentido para quien vive alli.
  const ajuste = interpretarAjusteUbicacion(mapa.get('ubicacion')) ?? { modo: 'auto' as const };
  if (ajuste.modo === 'fija') {
    const { lat, lon, etiqueta } = ajuste;
    return { ubicacion: { lat, lon, etiqueta }, modoUbicacion: 'fija', ubicacionDetectada: true, umbrales };
  }

  const detectada = await ubicacionDeLaPeticion();
  return {
    ubicacion: detectada ?? UBICACION_POR_DEFECTO,
    modoUbicacion: 'auto',
    ubicacionDetectada: detectada !== null,
    umbrales,
  };
}

/** Cuando se descargo la ultima copia completa (ISO), para el recordatorio. */
export const CLAVE_ULTIMA_COPIA = 'ultima_copia';

/** La fecha de la ultima copia completa, o null si nunca se ha descargado. */
export async function leerUltimaCopia(userId: string): Promise<string | null> {
  const valor = await leerAjuste(userId, CLAVE_ULTIMA_COPIA);
  return typeof valor === 'string' ? valor : null;
}

/** El valor de una clave, o null si no esta guardada. */
export async function leerAjuste(userId: string, clave: string): Promise<unknown> {
  const db = crearDb();
  const [fila] = await db
    .select({ valor: schema.ajuste.valor })
    .from(schema.ajuste)
    .where(and(eq(schema.ajuste.userId, userId), eq(schema.ajuste.clave, clave)))
    .limit(1);
  return fila?.valor ?? null;
}

export async function guardarAjuste(
  userId: string,
  clave: string,
  valor: unknown,
): Promise<void> {
  const db = crearDb();
  await db
    .insert(schema.ajuste)
    .values({ userId, clave, valor })
    .onConflictDoUpdate({
      target: [schema.ajuste.userId, schema.ajuste.clave],
      set: { valor, actualizadoEn: new Date() },
    });
}

export async function guardarUmbrales(
  userId: string,
  umbrales: UmbralesEstacion,
): Promise<void> {
  for (const [campo, clave] of Object.entries(CLAVES_UMBRAL) as [
    keyof UmbralesEstacion,
    string,
  ][]) {
    await guardarAjuste(userId, clave, umbrales[campo]);
  }
}

/**
 * Marca como atemporales justo los contextos de `ids` y desmarca los demas del
 * usuario. Son media docena de filas: se toca solo la que cambia.
 */
export async function guardarContextosAtemporales(userId: string, ids: string[]): Promise<void> {
  const db = crearDb();
  const elegidos = new Set(ids);
  const contextos = await db
    .select({ id: schema.contexto.id, atemporal: schema.contexto.atemporal })
    .from(schema.contexto)
    .where(eq(schema.contexto.userId, userId));
  for (const { id, atemporal } of contextos) {
    if (atemporal === elegidos.has(id)) continue;
    await db
      .update(schema.contexto)
      .set({ atemporal: !atemporal })
      .where(and(eq(schema.contexto.userId, userId), eq(schema.contexto.id, id)));
  }
}
