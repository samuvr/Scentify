/**
 * Seccion 5.1 — Consulta puntual de una ficha.
 *
 * UNA peticion del servidor, disparada por el usuario al pegar una URL. No hay
 * scraper, no se recorre el sitio, no hay cola ni lote. Si falla, se devuelve
 * el motivo y la interfaz ofrece los fallbacks de la 5.2.
 *
 * Fragrantica esta detras de Cloudflare Turnstile, que corta las IP de centro
 * de datos: desde Vercel la peticion directa casi nunca pasa. Con
 * `ZENROWS_API_KEY` la ficha se pide a traves de ZenRows, que la abre en un
 * navegador con IP residencial y devuelve el HTML ya pintado, el mismo que el
 * de los fixtures. Sin clave se intenta solo la peticion directa, como antes.
 */
import 'server-only';
import { esUrlDeFichaValida, leerFichaFragrantica, type FichaFragrantica } from '@/dominio/fragrantica';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 3_000_000;

/**
 * Abrir la ficha en un navegador con proxy residencial tarda; 45 s deja sitio
 * a la peticion directa de respaldo dentro de los 60 s de la ruta.
 */
const TIMEOUT_LECTOR_MS = 45_000;

const ZENROWS = 'https://api.zenrows.com/v1/';

/** User-Agent de navegador normal, como pide la especificacion. */
const CABECERAS = {
  'user-agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
} as const;

export type MotivoFallo = 'url-no-valida' | 'bloqueado' | 'sin-respuesta' | 'sin-datos' | 'lector-rechazado';

/**
 * Un fallo dice ademas si se ha pasado por ZenRows y que ha contestado. Sin
 * eso, «Fragrantica ha bloqueado la petición» era igual con la clave puesta
 * que sin ella, y no habia forma de saber cual de las dos cosas arreglar.
 */
export type Fallo = {
  ok: false;
  motivo: MotivoFallo;
  /** Si el servidor tiene `ZENROWS_API_KEY`. */
  conLector: boolean;
  /** Lo que ha respondido ZenRows, p. ej. «ZenRows 422 RESP001». */
  detalle?: string;
};

export type ResultadoConsulta = { ok: true; ficha: FichaFragrantica } | Fallo;

type Descarga =
  | { ok: true; html: string }
  | { ok: false; motivo: MotivoFallo; detalle?: string };

function claveLector(): string | null {
  return process.env.ZENROWS_API_KEY?.trim() || null;
}

export async function consultarFicha(url: string): Promise<ResultadoConsulta> {
  const clave = claveLector();
  const conLector = clave !== null;
  if (!esUrlDeFichaValida(url)) return { ok: false, motivo: 'url-no-valida', conLector };

  if (!clave) return leerDescarga(await descargarDirecto(url), conLector);

  const lector = leerDescarga(await descargarConLector(url, clave), conLector);
  if (lector.ok) return lector;
  console.warn('[fragrantica] ZenRows no ha traido la ficha:', lector.detalle ?? lector.motivo, url);

  // Sin creditos o con el servicio caido, la directa no cuesta nada y a veces
  // pasa. Si tampoco, se cuenta el fallo del lector, que es el que se arregla.
  const directa = leerDescarga(await descargarDirecto(url), conLector);
  return directa.ok ? directa : lector;
}

async function descargarDirecto(url: string): Promise<Descarga> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: CABECERAS,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, motivo: 'sin-respuesta' };
  }

  // 403 y 503 son la firma de Cloudflare; el resto, un fallo cualquiera.
  if (respuesta.status === 403 || respuesta.status === 503) {
    return { ok: false, motivo: 'bloqueado' };
  }
  if (!respuesta.ok) return { ok: false, motivo: 'sin-respuesta' };

  return { ok: true, html: (await respuesta.text()).slice(0, MAX_BYTES) };
}

/**
 * La misma ficha, pedida a traves de ZenRows. Hacen falta los dos parametros:
 * el proxy residencial para pasar Turnstile, y el navegador porque los votos
 * y los acordes los pinta Vue en la pagina, y el parser lee ese HTML pintado.
 * La espera da margen a que termine de pintar despues de la carga.
 *
 * Cuesta 25 creditos por ficha: el plan gratuito, 5.000 al mes, da para unas
 * 200. ZenRows no cobra las peticiones que fallan.
 */
async function descargarConLector(url: string, clave: string): Promise<Descarga> {
  const peticion = new URL(ZENROWS);
  peticion.search = new URLSearchParams({
    apikey: clave,
    url,
    js_render: 'true',
    premium_proxy: 'true',
    wait: '2000',
  }).toString();

  let respuesta: Response;
  try {
    respuesta = await fetch(peticion, { signal: AbortSignal.timeout(TIMEOUT_LECTOR_MS) });
  } catch (error) {
    const agotado = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      motivo: 'sin-respuesta',
      detalle: agotado ? `ZenRows, sin respuesta en ${TIMEOUT_LECTOR_MS / 1000} s` : 'ZenRows, error de red',
    };
  }

  if (!respuesta.ok) {
    const detalle = `ZenRows ${respuesta.status}${await codigoDeError(respuesta)}`;
    // 401 es la clave, 402 los creditos del mes y 403 lo que el plan no
    // incluye: todo se arregla en ZenRows, no reintentando.
    if ([401, 402, 403].includes(respuesta.status)) return { ok: false, motivo: 'lector-rechazado', detalle };
    // 422 es que ni con todo ha conseguido la pagina.
    if (respuesta.status === 422) return { ok: false, motivo: 'bloqueado', detalle };
    return { ok: false, motivo: 'sin-respuesta', detalle };
  }

  const html = (await respuesta.text()).slice(0, MAX_BYTES);
  return { ok: true, html };
}

/**
 * El codigo de error que ZenRows manda en el cuerpo (`RESP001`, `AUTH002`…),
 * que es lo que dice su documentacion de cada fallo. Vacio si no viene.
 */
async function codigoDeError(respuesta: Response): Promise<string> {
  try {
    const cuerpo: unknown = await respuesta.json();
    const codigo = (cuerpo as { code?: unknown } | null)?.code;
    return typeof codigo === 'string' && /^[A-Z]{2,8}\d{2,6}$/.test(codigo) ? ` ${codigo}` : '';
  } catch {
    return '';
  }
}

function leerDescarga(descarga: Descarga, conLector: boolean): ResultadoConsulta {
  if (!descarga.ok) return { ...descarga, conLector };
  const ficha = leerFichaFragrantica(descarga.html);

  // Si no se ha sacado ni un eje ni una nota, es que no hemos llegado a la
  // ficha: mejor decirlo y ofrecer el textarea que fingir que hay datos.
  const vacia =
    !ficha.estaciones &&
    !ficha.momentos &&
    ficha.notas.salida.length === 0 &&
    ficha.notas.fondo.length === 0;

  if (!vacia) return { ok: true, ficha };
  // Lo tipico es la pagina de reto de Cloudflare: su titulo lo dice.
  const titulo = descarga.html.match(/<title>([^<]{0,80})/i)?.[1]?.trim();
  return { ok: false, motivo: 'sin-datos', conLector, detalle: titulo ? `página «${titulo}»` : undefined };
}

/** Sin ZenRows configurado: la peticion sale de Vercel y Cloudflare la corta. */
const SIN_LECTOR: Record<MotivoFallo, string> = {
  'url-no-valida': 'Esa URL no parece una ficha de Fragrantica.',
  bloqueado: 'Fragrantica ha bloqueado la petición.',
  'sin-respuesta': 'Fragrantica no ha respondido.',
  'sin-datos': 'No se ha podido leer la ficha.',
  'lector-rechazado': 'ZenRows ha rechazado la petición.',
};

/** Con ZenRows configurado: lo ha intentado y no ha traido la ficha. */
const CON_LECTOR: Record<MotivoFallo, string> = {
  'url-no-valida': 'Esa URL no parece una ficha de Fragrantica.',
  bloqueado: 'Ni a través de ZenRows se ha podido abrir la ficha: Cloudflare la ha bloqueado.',
  'sin-respuesta': 'ZenRows no ha respondido a tiempo.',
  'sin-datos': 'ZenRows ha abierto la página, pero no traía la ficha.',
  'lector-rechazado': 'ZenRows ha rechazado la petición: revisa la clave o si quedan créditos este mes.',
};

/**
 * El aviso dice que ha fallado y que arreglar: sin la clave, falta ponerla;
 * con ella, lo que ha contestado ZenRows. Despues, el fallback de la 5.2.
 */
export function mensajeDeFallo({ motivo, conLector, detalle }: Fallo): string {
  if (motivo === 'url-no-valida') return SIN_LECTOR[motivo];
  const que = conLector
    ? `${CON_LECTOR[motivo]}${detalle ? ` (${detalle})` : ''}`
    : `${SIN_LECTOR[motivo]} El servidor no tiene ZenRows configurado (ZENROWS_API_KEY), que es lo que evita el bloqueo.`;
  return `${que} Mientras, pega el texto de la página.`;
}

/** Fallback 1 de la 5.2: el usuario pega el texto copiado del navegador. */
export function leerTextoPegado(texto: string): ResultadoConsulta {
  const ficha = leerFichaFragrantica(texto);
  const vacia = !ficha.estaciones && !ficha.momentos && ficha.notas.salida.length === 0;
  return vacia ? { ok: false, motivo: 'sin-datos', conLector: false } : { ok: true, ficha };
}
