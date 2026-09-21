/**
 * Seccion 5.1 — Consulta puntual de una ficha.
 *
 * UNA peticion del servidor, disparada por el usuario al pegar una URL. No hay
 * scraper, no se recorre el sitio, no hay cola ni lote. Si falla, se devuelve
 * el motivo y la interfaz ofrece los fallbacks de la 5.2.
 */
import 'server-only';
import { esUrlDeFichaValida, leerFichaFragrantica, type FichaFragrantica } from '@/dominio/fragrantica';

const TIMEOUT_MS = 8000;
const MAX_BYTES = 3_000_000;

/** User-Agent de navegador normal, como pide la especificacion. */
const CABECERAS = {
  'user-agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
} as const;

export type ResultadoConsulta =
  | { ok: true; ficha: FichaFragrantica }
  | { ok: false; motivo: 'url-no-valida' | 'bloqueado' | 'sin-respuesta' | 'sin-datos' };

export async function consultarFicha(url: string): Promise<ResultadoConsulta> {
  if (!esUrlDeFichaValida(url)) return { ok: false, motivo: 'url-no-valida' };

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

  const html = (await respuesta.text()).slice(0, MAX_BYTES);
  const ficha = leerFichaFragrantica(html);

  // Si no se ha sacado ni un eje ni una nota, es que no hemos llegado a la
  // ficha: mejor decirlo y ofrecer el textarea que fingir que hay datos.
  const vacia =
    !ficha.estaciones &&
    !ficha.momentos &&
    ficha.notas.salida.length === 0 &&
    ficha.notas.fondo.length === 0;

  return vacia ? { ok: false, motivo: 'sin-datos' } : { ok: true, ficha };
}

/** Fallback 1 de la 5.2: el usuario pega el texto copiado del navegador. */
export function leerTextoPegado(texto: string): ResultadoConsulta {
  const ficha = leerFichaFragrantica(texto);
  const vacia = !ficha.estaciones && !ficha.momentos && ficha.notas.salida.length === 0;
  return vacia ? { ok: false, motivo: 'sin-datos' } : { ok: true, ficha };
}
