/**
 * Ubicacion con la que se consulta el tiempo (seccion 7.1).
 *
 * Con varias cuentas ya no vale una sola ubicacion para todos. Cada usuario
 * elige entre una ubicacion fija o la automatica, que sale de la geolocalizacion
 * por IP que Vercel añade a cada peticion: sin pedir permiso de geolocalizacion
 * al navegador y sin que nadie tenga que saberse sus coordenadas.
 */

export interface Ubicacion {
  lat: number;
  lon: number;
  etiqueta: string;
}

/** Lo que se guarda en el ajuste `ubicacion`. */
export type AjusteUbicacion = { modo: 'auto' } | ({ modo: 'fija' } & Ubicacion);

export const UBICACION_POR_DEFECTO: Ubicacion = {
  lat: 38.4257,
  lon: -0.4009,
  etiqueta: 'El Campello, Alicante',
};

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Interpreta el valor guardado. Las filas anteriores a los modos son una
 * ubicacion a secas ({lat, lon, etiqueta}) y se leen como fija.
 */
export function interpretarAjusteUbicacion(valor: unknown): AjusteUbicacion | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as Record<string, unknown>;
  if (v.modo === 'auto') return { modo: 'auto' };
  if (esNumero(v.lat) && esNumero(v.lon)) {
    const etiqueta = typeof v.etiqueta === 'string' && v.etiqueta.trim() ? v.etiqueta : 'Mi ubicación';
    return { modo: 'fija', lat: v.lat, lon: v.lon, etiqueta };
  }
  return null;
}

function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

function nombrePais(codigo: string): string {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

/**
 * Ubicacion aproximada a partir de las cabeceras `x-vercel-ip-*`. Devuelve
 * null fuera de Vercel (en local, en los tests, en el cron) o si faltan las
 * coordenadas.
 */
export function ubicacionDesdeCabeceras(
  leer: (nombre: string) => string | null | undefined,
): Ubicacion | null {
  const lat = Number(leer('x-vercel-ip-latitude'));
  const lon = Number(leer('x-vercel-ip-longitude'));
  if (!leer('x-vercel-ip-latitude') || !leer('x-vercel-ip-longitude')) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  // La ciudad llega codificada como URI ("El%20Campello").
  const ciudad = leer('x-vercel-ip-city');
  const pais = leer('x-vercel-ip-country');
  const partes = [ciudad ? decodificar(ciudad) : null, pais ? nombrePais(pais) : null].filter(
    (p): p is string => Boolean(p),
  );
  return { lat, lon, etiqueta: partes.length > 0 ? partes.join(', ') : 'Tu ubicación' };
}
