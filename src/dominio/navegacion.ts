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

/*
 * Lo que llega por la URL (ids, fechas) lo puede escribir cualquiera. Pasado
 * tal cual a PostgreSQL, un id que no es un UUID o una fecha imposible
 * revientan la consulta con un 500; se filtran antes y se tratan como «no
 * esta» o «sin filtro».
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/** El valor si es un UUID; si no, undefined. */
export function uuidOVacio(valor: unknown): string | undefined {
  return esUuid(valor) ? valor : undefined;
}

/** 'YYYY-MM-DD' de un dia que existe: 2026-02-30 no vale. */
export function esFechaIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

/** La fecha si es valida; si no, undefined. */
export function fechaOVacia(valor: unknown): string | undefined {
  return esFechaIso(valor) ? valor : undefined;
}
