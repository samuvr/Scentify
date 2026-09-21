/**
 * Destino de «Compartir → Scentify» (Web Share Target).
 *
 * Desde la ficha de Fragrantica en el movil: Compartir → Scentify. Chrome
 * manda titulo, texto y URL, pero no siempre en el campo que uno esperaria:
 * segun desde donde se comparta, la URL llega en `url`, dentro de `text`, o
 * incluso pegada al final del titulo. Por eso se buscan las tres y se coge la
 * primera que sea una ficha valida.
 *
 * De la URL salen ademas la marca y el nombre, asi que el alta se abre con el
 * paso 1 ya relleno aunque la lectura automatica de la pagina falle.
 */
import { redirect } from 'next/navigation';
import { datosDeUrlFragrantica, esUrlDeFichaValida } from '@/dominio/fragrantica';
import { usuarioActual } from '@/servicios/auth';

export const dynamic = 'force-dynamic';

/** Primera URL de ficha que aparezca en cualquiera de los campos recibidos. */
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

export default async function PaginaCompartir({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const { title, text, url } = await searchParams;

  if (!(await usuarioActual())) {
    // Sin sesion no se pierde lo compartido: se vuelve aqui tras entrar.
    const destino = `/compartir?${new URLSearchParams(
      Object.entries({ title, text, url }).filter(([, v]) => v) as [string, string][],
    )}`;
    redirect(`/login?siguiente=${encodeURIComponent(destino)}`);
  }

  const ficha = urlCompartida([url, text, title]);
  if (!ficha) {
    // Se ha compartido algo que no es una ficha: al alta en blanco, con el
    // aviso de que no se ha reconocido nada.
    redirect('/coleccion/nuevo?compartido=no-reconocido');
  }

  const datos = datosDeUrlFragrantica(ficha);
  const parametros = new URLSearchParams({ url: ficha });
  if (datos) {
    parametros.set('nombre', datos.nombre);
    parametros.set('marca', datos.marca);
  }
  redirect(`/coleccion/nuevo?${parametros}`);
}
