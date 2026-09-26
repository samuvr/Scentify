/**
 * El boton «Enviar a Scentify»: un marcador del navegador que se pulsa con
 * la ficha de Fragrantica abierta.
 *
 * Corre en el navegador del usuario, que ya ha pasado Cloudflare, asi que no
 * hay bloqueo que valga: coge la direccion y el texto visible de la pagina
 * (lo mismo que copiar con Ctrl+A) y abre `/importar` con los dos detras del
 * `#`. El parser ya sabe leer ese texto; es el que usa el cuadro de pegar.
 *
 * El Atajo de iOS hace lo mismo desde el menu Compartir de Safari, que es la
 * unica forma de tenerlo en el iPhone: Safari no admite Web Share Target.
 */

/**
 * Tope del texto que se manda. Una ficha real ronda los 17 kB; el tope solo
 * evita una URL desmedida si se pulsa en una pagina enorme que no es ficha.
 */
export const MAXIMO_TEXTO = 200_000;

/** El JavaScript del marcador, listo para el `href` de un enlace. */
export function codigoMarcador(origen: string): string {
  const destino = JSON.stringify(`${origen.replace(/\/+$/, '')}/importar#`);
  const cuerpo = [
    // Mismo criterio que `esUrlDeFichaValida`: el dominio registrable.
    "if(location.hostname.toLowerCase().split('.').slice(-2)[0]!=='fragrantica'){alert('Abre la ficha de un perfume en Fragrantica y pulsa el botón allí.');return}",
    `var d=new URLSearchParams({u:location.href,t:document.body.innerText.slice(0,${MAXIMO_TEXTO})});`,
    `var u=${destino}+d;`,
    'if(!window.open(u,"_blank"))location.assign(u)',
  ].join('');
  return `javascript:(function(){${cuerpo}})()`;
}

/** El paso «Ejecutar JavaScript en página web» del Atajo de iOS. */
export function codigoAtajo(): string {
  return `completion(new URLSearchParams({u: location.href, t: document.body.innerText.slice(0, ${MAXIMO_TEXTO})}).toString());`;
}

/** Lo que `/importar` saca de su fragmento. */
export function leerFragmentoImportar(fragmento: string): { url?: string; texto?: string } | null {
  const parametros = new URLSearchParams(fragmento.replace(/^#/, ''));
  const url = parametros.get('u') || undefined;
  const texto = parametros.get('t') || undefined;
  return url || texto ? { url, texto } : null;
}
