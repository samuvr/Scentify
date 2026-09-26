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
import { usuarioActual } from '@/servicios/auth';
import { destinoDeCompartido } from '@/servicios/compartido';

export const dynamic = 'force-dynamic';

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

  return a(destinoDeCompartido({ title, text, url }));
}

export async function POST(peticion: Request) {
  return manejar(peticion);
}

export async function GET(peticion: Request) {
  return manejar(peticion);
}
