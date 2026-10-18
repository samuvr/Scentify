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
 *
 * Si el perfume ya esta en mi coleccion no hay alta que hacer: lo que se trae
 * es «Esta fragancia me recuerda a» a su ficha. Es la forma de completar los
 * perfumes de antes, uno a uno, porque no se puede en lote: la especificacion
 * prohibe recorrer Fragrantica (5.1), Cloudflare bloquea al servidor y el
 * bloque se pinta en el navegador, asi que solo llega desde alli.
 */
import 'server-only';
import { empaquetarFicha } from '@/dominio/ficha-compartida';
import {
  datosDeUrlFragrantica,
  leerFichaFragrantica,
  urlDeFichaEn,
  type FichaFragrantica,
} from '@/dominio/fragrantica';
import { parecidosValidos } from '@/dominio/parecidos';
import { miFrascoDeFragrantica } from './consultas';
import { guardarParecidos } from './perfumes';

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

/** La ficha leida, si lo compartido era el texto de la pagina. */
function fichaDelTexto(texto: string | undefined): FichaFragrantica | null {
  if (!texto || texto.trim().length < MINIMO_TEXTO_DE_PAGINA) return null;

  const ficha = leerFichaFragrantica(texto);
  const hayAlgo =
    ficha.notas.salida.length > 0 ||
    ficha.notas.corazon.length > 0 ||
    ficha.notas.fondo.length > 0 ||
    ficha.acordes.length > 0 ||
    ficha.estaciones !== null ||
    ficha.parecidos.length > 0;
  return hayAlgo ? ficha : null;
}

/**
 * A donde ir con lo compartido.
 *
 * Si ya tengo ese perfume, a su ficha, con «Esta fragancia me recuerda a»
 * guardado si venia. Si no, a la ruta del alta con todo lo que se ha podido
 * adelantar: la URL, la marca y el nombre sacados de ella, y la ficha leida
 * del texto.
 */
export async function destinoDeCompartido(
  userId: string,
  { title, text, url }: Compartido,
): Promise<string> {
  const parametros = new URLSearchParams();

  // Chrome no reparte los campos igual segun desde donde se comparta: la URL
  // puede venir en `url`, dentro de `text`, o pegada al titulo.
  const direccion = urlDeFichaEn([url, text, title]);
  const ficha = fichaDelTexto(text);

  const mio = direccion ? await miFrascoDeFragrantica(userId, direccion) : null;
  if (mio && direccion) {
    const parecidos = ficha
      ? parecidosValidos({ leidosEn: new Date().toISOString(), perfumes: ficha.parecidos })
      : null;
    if (!parecidos) return `/coleccion/${mio.perfumeId}?guardado=sin-parecidos`;
    await guardarParecidos(mio.fichaId, parecidos, direccion);
    return `/coleccion/${mio.perfumeId}?guardado=parecidos`;
  }

  if (direccion) {
    parametros.set('url', direccion);
    const datos = datosDeUrlFragrantica(direccion);
    if (datos) {
      parametros.set('nombre', datos.nombre);
      parametros.set('marca', datos.marca);
    }
  }

  const leida = ficha ? empaquetarFicha(ficha) : null;
  if (leida && leida.length <= MAXIMO_FICHA_EN_URL) parametros.set('ficha', leida);

  if (!direccion && !leida) return '/coleccion/nuevo?compartido=no-reconocido';
  return `/coleccion/nuevo?${parametros}`;
}
