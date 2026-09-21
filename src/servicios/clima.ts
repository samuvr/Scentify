/**
 * Seccion 7.1 — Fuente de tiempo: Open-Meteo, gratuita y sin API key.
 *
 * Una llamada al dia por ubicacion, cacheada en `clima_diario`. La cache tiene
 * un segundo uso: un registro con fecha pasada se calcula con el tiempo que hizo
 * realmente ese dia, no con el de hoy.
 *
 * Si la peticion falla, devuelve null. Quien llama se cae al calendario: ninguna
 * pantalla se queda bloqueada porque Open-Meteo no responda.
 */
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import type { ClimaDia } from '@/dominio/estacion';
import type { Ubicacion } from './ajustes';

/** El endpoint de prevision cubre hasta 92 dias hacia atras; mas alla, el archivo. */
const DIAS_MAX_PREVISION = 92;
const TIMEOUT_MS = 6000;

interface RespuestaOpenMeteo {
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    relative_humidity_2m_mean?: (number | null)[];
  };
}

const aIso = (fecha: Date | string): string =>
  typeof fecha === 'string' ? fecha.slice(0, 10) : fecha.toISOString().slice(0, 10);

function diasDesde(iso: string): number {
  const hoy = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((hoy - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
}

function urlPara(ubicacion: Ubicacion, iso: string): string {
  const antiguedad = diasDesde(iso);
  const base =
    antiguedad > DIAS_MAX_PREVISION
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';

  const parametros = new URLSearchParams({
    latitude: String(ubicacion.lat),
    longitude: String(ubicacion.lon),
    daily: 'temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean',
    timezone: 'auto',
    start_date: iso,
    end_date: iso,
  });
  return `${base}?${parametros}`;
}

async function consultarOpenMeteo(ubicacion: Ubicacion, iso: string): Promise<ClimaDia | null> {
  try {
    const respuesta = await fetch(urlPara(ubicacion, iso), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!respuesta.ok) return null;

    const datos = (await respuesta.json()) as RespuestaOpenMeteo;
    const max = datos.daily?.temperature_2m_max?.[0];
    const min = datos.daily?.temperature_2m_min?.[0];
    if (typeof max !== 'number' || typeof min !== 'number') return null;

    const humedad = datos.daily?.relative_humidity_2m_mean?.[0];
    return {
      temperaturaMax: max,
      temperaturaMin: min,
      humedadMedia: typeof humedad === 'number' ? humedad : null,
    };
  } catch {
    // Timeout, DNS, sin conexion, respuesta ilegible: todo cae al mismo sitio.
    return null;
  }
}

/**
 * Clima de un dia concreto, de la cache si esta y de Open-Meteo si no.
 * Devuelve null cuando no hay forma de saberlo.
 */
export async function obtenerClima(
  ubicacion: Ubicacion,
  fecha: Date | string = new Date(),
): Promise<ClimaDia | null> {
  const iso = aIso(fecha);
  const db = crearDb();
  const lat = ubicacion.lat.toFixed(5);
  const lon = ubicacion.lon.toFixed(5);

  const [cacheado] = await db
    .select()
    .from(schema.climaDiario)
    .where(
      and(
        eq(schema.climaDiario.lat, lat),
        eq(schema.climaDiario.lon, lon),
        eq(schema.climaDiario.fecha, iso),
      ),
    )
    .limit(1);

  if (cacheado) {
    return {
      temperaturaMax: Number(cacheado.temperaturaMax),
      temperaturaMin: Number(cacheado.temperaturaMin),
      humedadMedia: cacheado.humedadMedia === null ? null : Number(cacheado.humedadMedia),
    };
  }

  const clima = await consultarOpenMeteo(ubicacion, iso);
  if (!clima) return null;

  await db
    .insert(schema.climaDiario)
    .values({
      lat,
      lon,
      fecha: iso,
      temperaturaMax: clima.temperaturaMax.toFixed(1),
      temperaturaMin: clima.temperaturaMin.toFixed(1),
      humedadMedia: typeof clima.humedadMedia === 'number' ? clima.humedadMedia.toFixed(2) : null,
    })
    .onConflictDoUpdate({
      target: [schema.climaDiario.lat, schema.climaDiario.lon, schema.climaDiario.fecha],
      set: { obtenidoEn: sql`now()` },
    });

  return clima;
}
