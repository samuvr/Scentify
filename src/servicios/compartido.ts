/**
 * Lo que llega de Fragrantica por fuera del formulario, convertido en el
 * destino del alta.
 *
 * Dos puertas usan esto y las dos traen lo mismo, una direccion y a veces el
 * texto de la pagina:
 *
 *  - «Compartir → Scentify» en Android (`/compartir`, Web Share Target).
 *  - El boton «Enviar a Scentify» del navegador y el Atajo de iOS
 *    (`/importar`). Corren en el navegador del usuario, que ya ha pasado
 *    Cloudflare, asi que el texto llega siempre.
 *
 * Lo que viaja al formulario no es el texto (unos 17 kB) sino la ficha ya
 * leida, unos 700 caracteres, validada al llegar en `desempaquetarFicha()`.
 */
import 'server-only';
import { empaquetarFicha } from '@/dominio/ficha-compartida';
import {
  datosDeUrlFragrantica,
  esUrlDeFichaValida,
  leerFichaFragrantica,
} from '@/dominio/fragrantica';

/** Por debajo de esto no es una pagina compartida, es un enlace suelto. */
const MINIMO_TEXTO_DE_PAGINA = 200;

/**
 * Tope de la ficha que viaja en la redireccion. Las reales rondan los 700
 * caracteres; el tope solo evita construir una URL desmedida si algun dia
 * aparece una ficha enorme. Si se pasa, se sigue a mano.
 */
const MAXIMO_FICHA_EN_URL = 4000;

export interface Compartido {
  title?: string;
  text?: string;
  url?: string;
}

/**
 * Chrome no reparte los campos igual segun desde donde se comparta: la URL
 * puede venir en `url`, dentro de `text`, o pegada al titulo. Se miran todos.
 */
export function urlCompartida(campos: (string | undefined)[]): string | null {
  for (const campo of campos) {
    if (!campo) continue;
    for (const candidata of campo.match(/https?:\/\/\S+/g) ?? [campo.trim()]) {
      // Chrome a veces arrastra un parentesis o una coma al final del enlace.
      const limpia = candidata.replace(/[).,;]+$/, '');
      if (esUrlDeFichaValida(limpia)) return limpia;
    }
  }
  return null;
}

/** La ficha parseada y empaquetada, si lo compartido era el texto de la pagina. */
function fichaDelTexto(texto: string | undefined): string | null {
  if (!texto || texto.trim().length < MINIMO_TEXTO_DE_PAGINA) return null;

  const ficha = leerFichaFragrantica(texto);
  const hayAlgo =
    ficha.notas.salida.length > 0 ||
    ficha.notas.corazon.length > 0 ||
    ficha.notas.fondo.length > 0 ||
    ficha.acordes.length > 0 ||
    ficha.estaciones !== null;
  if (!hayAlgo) return null;

  const empaquetada = empaquetarFicha(ficha);
  return empaquetada.length > MAXIMO_FICHA_EN_URL ? null : empaquetada;
}

/**
 * La ruta del alta con todo lo que se ha podido adelantar: la URL, la marca y
 * el nombre sacados de ella, y la ficha leida del texto.
 */
export function destinoDeCompartido({ title, text, url }: Compartido): string {
  const parametros = new URLSearchParams();

  const direccion = urlCompartida([url, text, title]);
  if (direccion) {
    parametros.set('url', direccion);
    const datos = datosDeUrlFragrantica(direccion);
    if (datos) {
      parametros.set('nombre', datos.nombre);
      parametros.set('marca', datos.marca);
    }
  }

  const leida = fichaDelTexto(text);
  if (leida) parametros.set('ficha', leida);

  if (!direccion && !leida) return '/coleccion/nuevo?compartido=no-reconocido';
  return `/coleccion/nuevo?${parametros}`;
}
