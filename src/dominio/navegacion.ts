/**
 * Destinos de vuelta tras iniciar sesion.
 *
 * Lo usa «Compartir → Scentify»: si al compartir una ficha no hay sesion, se
 * pide la contrasenia y luego se vuelve a lo compartido en vez de perderlo.
 *
 * El valor llega por la query, o sea que lo controla quien construya el
 * enlace. Sin filtrarlo, el login seria un redirector abierto: bastaria
 * mandarle a alguien /login?siguiente=https://sitio-falso.example para que la
 * app le echase ahi despues de escribir su contrasenia, con el aval de haber
 * empezado en un dominio de confianza. Por eso solo se admiten rutas de esta
 * misma app, y ante cualquier duda se vuelve al inicio.
 */
export function destinoSeguro(valor: unknown): string {
  if (typeof valor !== 'string') return '/';
  const ruta = valor.trim();

  // Tiene que ser una ruta absoluta de este sitio...
  if (!ruta.startsWith('/')) return '/';
  // ...y no "//otro-sitio", que el navegador trata como URL con protocolo
  // heredado y sale fuera igual que una absoluta.
  if (ruta.startsWith('//') || ruta.startsWith('/\\')) return '/';
  // Ni caracteres de control. Un salto de linea partiria una cabecera
  // Location, y el navegador quita tabuladores y saltos al resolver la URL:
  // "/\t/otro-sitio" acaba siendo "//otro-sitio".
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(ruta)) return '/';

  return ruta;
}
