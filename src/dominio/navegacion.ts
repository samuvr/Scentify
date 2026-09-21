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
  // Ni un salto de linea, que partiria una cabecera Location.
  if (/[\r\n]/.test(ruta)) return '/';

  return ruta;
}
