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
 * navegador con IP residencial. Sin clave se intenta solo la peticion
 * directa, como antes.
 *
 * Lo que sirve el servidor de Fragrantica trae la piramide y los acordes,
 * pero no los votos de estacion y momento: esos los pinta en el navegador un
 * componente de Vue (`<seasons-rating-new>`). Por eso a ZenRows se le pide que
 * espere a que aparezcan antes de devolver la pagina.
 */
import 'server-only';
import { esUrlDeFichaValida, leerFichaFragrantica, type FichaFragrantica } from '@/dominio/fragrantica';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 3_000_000;

/**
 * Lo que puede durar la consulta entera, dentro de los 120 s de la ruta.
 * ZenRows tarda de normal entre 10 y 30 s con navegador y proxy residencial,
 * pero admite hasta 3 minutos: el tope corta la cola larga sin dejar al
 * usuario mirando la pantalla mas de la cuenta.
 */
const PLAZO_MS = 100_000;

/** Por debajo de esto ya no merece la pena la peticion directa de respaldo. */
const MINIMO_PARA_DIRECTA_MS = 3000;

const ZENROWS = 'https://api.zenrows.com/v1/';

/**
 * Los recuentos de los votos ya pintados: seis en una ficha (cuatro
 * estaciones, dia y noche) y ninguno en el HTML que sirve el servidor.
 */
const SELECTOR_VOTOS = 'div[index] span.tabular-nums';

/**
 * Esperar a los votos dentro de `js_instructions`, no con el `wait_for` de
 * primer nivel. Si los votos no aparecen (una ficha sin votos todavia), el de
 * primer nivel acaba en un 422 y se pierde la pagina entera, notas incluidas;
 * dentro de las instrucciones, ZenRows da ese paso por fallido a los 10 s y
 * devuelve la pagina igual. El segundo de despues es por si los recuentos se
 * animan al aparecer.
 */
const ESPERAR_VOTOS = JSON.stringify([{ wait_for: SELECTOR_VOTOS }, { wait: 1000 }]);

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
  | { ok: true; html: string; ms: number; traza: string }
  | { ok: false; motivo: MotivoFallo; detalle?: string; estado?: number; agotado?: boolean };

function claveLector(): string | null {
  return process.env.ZENROWS_API_KEY?.trim() || null;
}

/** Lo que queda del plazo de la consulta, en milisegundos. */
type Plazo = () => number;

export async function consultarFicha(url: string): Promise<ResultadoConsulta> {
  const clave = claveLector();
  const conLector = clave !== null;
  if (!esUrlDeFichaValida(url)) return { ok: false, motivo: 'url-no-valida', conLector };

  const fin = Date.now() + PLAZO_MS;
  const quedan: Plazo = () => fin - Date.now();

  if (!clave) {
    const directa = leerDescarga(await descargarDirecto(url, quedan), conLector);
    if (!directa.ok) console.warn('[fragrantica] sin ZENROWS_API_KEY:', directa.motivo, url);
    return directa;
  }

  const descarga = await descargarConLector(url, clave, quedan);
  const lector = leerDescarga(descarga, conLector);
  if (descarga.ok) {
    // Una linea por lectura: es lo que dice, desde los logs de Vercel, si
    // los votos llegaron y, si no, por que (ver «Leer la ficha con solo el
    // enlace» en el README).
    console.info('[fragrantica] ZenRows', url, descarga.traza, JSON.stringify(huella(descarga, lector)));
  }
  if (lector.ok) return lector;
  console.warn('[fragrantica] ZenRows no ha traido la ficha:', lector.detalle ?? lector.motivo, url);

  // Sin creditos o con el servicio caido, la directa no cuesta nada y a veces
  // pasa. Despues de agotar el tiempo con ZenRows, no: no queda plazo, y desde
  // Vercel casi nunca pasa. Si falla, se cuenta el fallo del lector, que es el
  // que se arregla.
  const agotado = !descarga.ok && descarga.agotado;
  if (agotado || quedan() < MINIMO_PARA_DIRECTA_MS) return lector;
  const directa = leerDescarga(await descargarDirecto(url, quedan), conLector);
  return directa.ok ? directa : lector;
}

async function descargarDirecto(url: string, quedan: Plazo): Promise<Descarga> {
  const inicio = Date.now();
  try {
    const respuesta = await fetch(url, {
      headers: CABECERAS,
      redirect: 'follow',
      signal: AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_MS, quedan()))),
    });

    // 403 y 503 son la firma de Cloudflare; el resto, un fallo cualquiera.
    if (respuesta.status === 403 || respuesta.status === 503) {
      return { ok: false, motivo: 'bloqueado', estado: respuesta.status };
    }
    if (!respuesta.ok) return { ok: false, motivo: 'sin-respuesta', estado: respuesta.status };

    // El cuerpo tambien va dentro del try: si la conexion se corta a medias,
    // es un fallo previsto y no un 500 sin explicacion.
    const html = (await respuesta.text()).slice(0, MAX_BYTES);
    return { ok: true, html, ms: Date.now() - inicio, traza: '' };
  } catch {
    return { ok: false, motivo: 'sin-respuesta' };
  }
}

/**
 * La ficha, pedida a traves de ZenRows y esperando a los votos. Si ZenRows
 * rechaza la peticion por sus parametros (un 400, antes de abrir la pagina),
 * se repite una vez sin la espera: mejor la ficha sin votos que sin nada.
 */
async function descargarConLector(url: string, clave: string, quedan: Plazo): Promise<Descarga> {
  const primera = await pedirAlLector(url, clave, true, quedan);
  if (primera.ok || primera.estado !== 400 || quedan() < MINIMO_PARA_DIRECTA_MS) return primera;
  console.warn('[fragrantica] ZenRows ha rechazado la espera de los votos:', primera.detalle);
  return pedirAlLector(url, clave, false, quedan);
}

/**
 * Hacen falta los dos parametros: el proxy residencial para pasar Turnstile y
 * el navegador para que Vue pinte los votos. Cuesta 25 creditos por ficha (la
 * espera no suma): el plan gratuito, 5.000 al mes, da para unas 200. ZenRows no
 * cobra las peticiones que fallan.
 */
async function pedirAlLector(
  url: string,
  clave: string,
  esperarVotos: boolean,
  quedan: Plazo,
): Promise<Descarga> {
  const peticion = new URL(ZENROWS);
  peticion.search = new URLSearchParams({
    apikey: clave,
    url,
    js_render: 'true',
    premium_proxy: 'true',
    ...(esperarVotos ? { js_instructions: ESPERAR_VOTOS } : { wait: '2000' }),
  }).toString();

  const inicio = Date.now();
  const limite = Math.max(1, quedan());
  try {
    const respuesta = await fetch(peticion, { signal: AbortSignal.timeout(limite) });

    if (!respuesta.ok) {
      const estado = respuesta.status;
      const codigo = await codigoDeError(respuesta);
      const detalle = `ZenRows ${estado}${codigo ? ` ${codigo}` : ''}`;
      // 401 es la clave y 402 los creditos del mes o lo que el plan no
      // incluye (AUTH010): se arregla en ZenRows, no reintentando. En 403,
      // AUTH009 es la cuenta sin verificar; BLK0001, en cambio, es un
      // bloqueo temporal por demasiados errores, que se pasa solo.
      if (estado === 401 || estado === 402 || (estado === 403 && codigo !== 'BLK0001')) {
        return { ok: false, motivo: 'lector-rechazado', detalle, estado };
      }
      // 422 es que ni con todo ha conseguido la pagina.
      if (estado === 422) return { ok: false, motivo: 'bloqueado', detalle, estado };
      return { ok: false, motivo: 'sin-respuesta', detalle, estado };
    }

    const html = (await respuesta.text()).slice(0, MAX_BYTES);
    // Para cruzar el log con el panel de ZenRows. La peticion no se escribe
    // nunca en ningun sitio: lleva la clave.
    const traza = ['x-request-id', 'x-request-cost', 'zr-final-url']
      .map((cabecera) => respuesta.headers.get(cabecera) ?? '-')
      .join(' ')
      .slice(0, 300);
    return { ok: true, html, ms: Date.now() - inicio, traza: `${esperarVotos ? 'votos' : 'sin-espera'} ${traza}` };
  } catch (error) {
    const agotado = error instanceof Error && error.name === 'TimeoutError';
    return {
      ok: false,
      motivo: 'sin-respuesta',
      agotado,
      detalle: agotado ? `ZenRows, sin respuesta en ${Math.round(limite / 1000)} s` : 'ZenRows, error de red',
    };
  }
}

/**
 * El codigo de error que ZenRows manda en el cuerpo (`RESP001`, `AUTH002`…),
 * que es lo que dice su documentacion de cada fallo. Vacio si no viene.
 */
async function codigoDeError(respuesta: Response): Promise<string> {
  try {
    const cuerpo: unknown = await respuesta.json();
    const codigo = (cuerpo as { code?: unknown } | null)?.code;
    return typeof codigo === 'string' && /^[A-Z]{2,8}\d{2,6}$/.test(codigo) ? codigo : '';
  } catch {
    return '';
  }
}

/**
 * Lo justo para saber, desde el log, que ha devuelto ZenRows: si Vue llego a
 * montar los votos, si el componente se quedo sin pintar, cuanto tardo y que
 * ha sacado el parser. Sin la clave y por debajo de 1 kB.
 */
function huella(descarga: Extract<Descarga, { ok: true }>, lector: ResultadoConsulta) {
  const { html } = descarga;
  const cuenta = (patron: RegExp) => html.match(patron)?.length ?? 0;
  const ficha = lector.ok ? lector.ficha : null;
  const eje = (valores: Record<string, { votos: number | null; anchura: number | null }> | null | undefined) =>
    valores
      ? Object.entries(valores)
          .map(([clave, voto]) => `${clave}:${voto.votos ?? '-'}|${voto.anchura ?? '-'}`)
          .join(' ')
      : null;
  const cuando = html.search(/cu(?:á|a|&aacute;)ndo usarlo|when to wear/i);
  const texto =
    cuando < 0
      ? null
      : html
          .slice(cuando, cuando + 6000)
          .replace(/<(script|style|svg)[\s\S]*?(?:<\/\1>|$)/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240);
  return {
    ms: descarga.ms,
    bytes: html.length,
    titulo: html.match(/<title>([^<]{0,80})/i)?.[1]?.trim() ?? null,
    vue: html.includes('data-v-app'),
    votosSinPintar: /<seasons-rating-new\b/i.test(html),
    items: cuenta(/\sindex="\d+"/g),
    recuentos: cuenta(/tabular-nums/g),
    estaciones: eje(ficha?.estaciones),
    momentos: eje(ficha?.momentos),
    notas: ficha ? ficha.notas.salida.length + ficha.notas.corazon.length + ficha.notas.fondo.length : 0,
    acordes: ficha?.acordes.length ?? 0,
    parecidos: ficha?.parecidos.length ?? 0,
    texto,
  };
}

function leerDescarga(descarga: Descarga, conLector: boolean): ResultadoConsulta {
  if (!descarga.ok) {
    const { motivo, detalle } = descarga;
    return { ok: false, motivo, conLector, ...(detalle ? { detalle } : {}) };
  }
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
  'sin-respuesta': 'ZenRows no ha podido traer la ficha esta vez.',
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
