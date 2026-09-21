/**
 * Destino de «Compartir → Scentify» (Web Share Target).
 *
 * Dos formas de llegar, y las dos importan:
 *
 *  1. Compartir la PAGINA desde Fragrantica. Llega la direccion, y de ella
 *     salen la marca y el nombre. La lectura automatica se intenta luego en
 *     el formulario, aunque Cloudflare suele bloquearla desde Vercel.
 *  2. Seleccionar todo el texto y compartir LA SELECCION. Llega la pagina
 *     entera como texto y se parsea aqui mismo, que es lo unico que funciona
 *     de verdad con el bloqueo puesto. Ahorra el baile de copiar, cambiar de
 *     aplicacion y pegar.
 *
 * Es POST con multipart, no GET, porque el caso 2 manda decenas de miles de
 * caracteres y no caben en una query.
 *
 * Chrome no reparte los campos igual segun desde donde se comparta: la URL
 * puede venir en `url`, dentro de `text`, o pegada al titulo. Se miran los
 * tres.
 */
import { NextResponse } from 'next/server';
import { empaquetarFicha } from '@/dominio/ficha-compartida';
import {
  datosDeUrlFragrantica,
  esUrlDeFichaValida,
  leerFichaFragrantica,
} from '@/dominio/fragrantica';
import { usuarioActual } from '@/servicios/auth';

export const dynamic = 'force-dynamic';

/** Por debajo de esto no es una pagina compartida, es un enlace suelto. */
const MINIMO_TEXTO_DE_PAGINA = 200;

/**
 * Tope de la ficha que viaja en la redireccion. Las reales rondan los 700
 * caracteres; el tope solo evita construir una URL desmedida si algun dia
 * aparece una ficha enorme. Si se pasa, se sigue a mano.
 */
const MAXIMO_FICHA_EN_URL = 4000;

function urlCompartida(campos: (string | undefined)[]): string | null {
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

/** La ficha parseada, si lo compartido era el texto de la pagina. */
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

async function manejar(peticion: Request): Promise<Response> {
  const origen = new URL(peticion.url);

  let title: string | undefined;
  let text: string | undefined;
  let url: string | undefined;

  if (peticion.method === 'POST') {
    const datos = await peticion.formData();
    const leer = (clave: string) => {
      const valor = datos.get(clave);
      return typeof valor === 'string' ? valor : undefined;
    };
    title = leer('title');
    text = leer('text');
    url = leer('url');
  } else {
    // Una instalacion anterior puede seguir compartiendo por GET hasta que el
    // navegador se quede con el manifest nuevo.
    title = origen.searchParams.get('title') ?? undefined;
    text = origen.searchParams.get('text') ?? undefined;
    url = origen.searchParams.get('url') ?? undefined;
  }

  const a = (ruta: string) => NextResponse.redirect(new URL(ruta, origen), 303);

  if (!(await usuarioActual())) {
    // Sin sesion no se pierde lo compartido... salvo el texto largo, que no
    // cabe en una URL de vuelta. Se avisa en vez de fingir que sigue ahi.
    const pendiente = new URLSearchParams();
    if (url) pendiente.set('url', url);
    if (title) pendiente.set('title', title);
    const destino = `/compartir?${pendiente}`;
    return a(`/login?siguiente=${encodeURIComponent(destino)}`);
  }

  const parametros = new URLSearchParams();

  const ficha = urlCompartida([url, text, title]);
  if (ficha) {
    parametros.set('url', ficha);
    const datos = datosDeUrlFragrantica(ficha);
    if (datos) {
      parametros.set('nombre', datos.nombre);
      parametros.set('marca', datos.marca);
    }
  }

  const leida = fichaDelTexto(text);
  if (leida) parametros.set('ficha', leida);

  if (!ficha && !leida) return a('/coleccion/nuevo?compartido=no-reconocido');
  return a(`/coleccion/nuevo?${parametros}`);
}

export async function POST(peticion: Request) {
  return manejar(peticion);
}

export async function GET(peticion: Request) {
  return manejar(peticion);
}
