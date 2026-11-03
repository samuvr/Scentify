/**
 * Lo que un contexto dice de si mismo, mas alla de su nombre: en que momentos
 * existe y cuanto se usa.
 *
 * Un contexto puede existir solo de dia o solo de noche: a la oficina se va de
 * dia, y «Oficina · Noche» no es una combinacion que haya que cubrir,
 * recomendar ni registrar. Los atemporales (el gimnasio) valen a cualquier
 * hora: ahi el momento no cuenta.
 *
 * La frecuencia (usos por semana y parte de noche) la dice el usuario y es lo
 * que pesa cada contexto en el reparto. Al lado se enseña la real de los
 * ultimos 90 dias, para ver si lo dicho se aleja de lo vivido.
 */
import type { Momento } from './tipos';

const TODOS: readonly Momento[] = ['DIA', 'NOCHE'];

export interface ContextoConMomentos {
  id: string;
  atemporal: boolean;
  /** Momentos en que se usa. Vacio se trata como los dos. */
  momentos: readonly Momento[];
}

/** Los momentos en que existe el contexto, en orden: dia y noche. */
export function momentosDe(c: Pick<ContextoConMomentos, 'atemporal' | 'momentos'>): Momento[] {
  if (c.atemporal) return [...TODOS];
  const propios = TODOS.filter((m) => c.momentos.includes(m));
  return propios.length > 0 ? propios : [...TODOS];
}

export const admiteMomento = (
  c: Pick<ContextoConMomentos, 'atemporal' | 'momentos'>,
  momento: Momento,
): boolean => momentosDe(c).includes(momento);

/** Los contextos que existen en ese momento, en el orden de entrada. */
export function contextosDelMomento<T extends Pick<ContextoConMomentos, 'atemporal' | 'momentos'>>(
  contextos: readonly T[],
  momento: Momento,
): T[] {
  return contextos.filter((c) => admiteMomento(c, momento));
}

/**
 * El contexto que toca en un momento: el preferido (el habitual, el de la URL)
 * si existe en ese momento; si no, el primero que exista, mejor uno que no sea
 * atemporal: con el gimnasio elegido no se enseña el momento, y no habria
 * forma de volver al dia. null si ninguno.
 */
export function contextoParaMomento<T extends ContextoConMomentos>(
  contextos: readonly T[],
  momento: Momento,
  preferido?: string | null,
): T | null {
  const validos = contextosDelMomento(contextos, momento);
  return (
    validos.find((c) => c.id === preferido) ??
    validos.find((c) => !c.atemporal) ??
    validos[0] ??
    null
  );
}

/**
 * Momentos de cada contexto que no los tiene todos, para quien solo necesita
 * saber que casillas existen (huecos, recategorizacion). Los que valen a
 * cualquier hora no aparecen.
 */
export function momentosPorContexto(
  contextos: readonly ContextoConMomentos[],
): Record<string, Momento[]> {
  const mapa: Record<string, Momento[]> = {};
  for (const c of contextos) {
    const propios = momentosDe(c);
    if (propios.length < TODOS.length) mapa[c.id] = propios;
  }
  return mapa;
}

/* ------------------------------------------------------------- frecuencia */

export interface FrecuenciaContexto extends ContextoConMomentos {
  /** Veces por semana que se usa, dicho por el usuario. null: sin decir. */
  usosSemana: number | null;
  /** Que parte de los usos es de noche, 0-100. Solo cuenta con los dos momentos. */
  pctNoche: number;
}

/**
 * Que parte de los usos del contexto cae en ese momento: 1 o 0 si solo existe
 * en uno, la proporcion dicha si existe en los dos. En un atemporal no hay
 * reparto por momento: todo cae en su unica casilla.
 */
export function fraccionDelMomento(
  c: Pick<FrecuenciaContexto, 'atemporal' | 'momentos' | 'pctNoche'>,
  momento: Momento,
): number {
  if (c.atemporal) return 1;
  const propios = momentosDe(c);
  if (!propios.includes(momento)) return 0;
  if (propios.length === 1) return 1;
  const noche = Math.min(100, Math.max(0, c.pctNoche)) / 100;
  return momento === 'NOCHE' ? noche : 1 - noche;
}

/** Los dias que se miran para la frecuencia real. */
export const DIAS_FRECUENCIA_REAL = 90;

export interface OcasionesReales {
  contextoId: string;
  /** Dias y momentos distintos con algun uso en ese contexto. */
  ocasiones: number;
  /** De esas, las de noche. */
  noches: number;
}

export interface FrecuenciaReal {
  usosSemana: number;
  /** null si no hay ninguna ocasion: no hay parte de noche que calcular. */
  pctNoche: number | null;
}

/**
 * La frecuencia real de cada contexto en la ventana: ocasiones por semana y
 * que parte de noche. Una ocasion es un dia y un momento: dos perfumes la
 * misma noche para la misma cita son una cita, no dos.
 *
 * La ventana son los ultimos 90 dias, o menos si el historial empieza despues:
 * con dos semanas de registros, dividir entre trece daria una frecuencia que
 * no es la tuya. Sin historial, un mapa vacio.
 */
export function frecuenciaReal(
  filas: readonly OcasionesReales[],
  diasConHistorial: number,
): Map<string, FrecuenciaReal> {
  const resultado = new Map<string, FrecuenciaReal>();
  const dias = Math.min(DIAS_FRECUENCIA_REAL, Math.max(0, Math.floor(diasConHistorial)));
  if (dias === 0) return resultado;
  const semanas = dias / 7;
  for (const { contextoId, ocasiones, noches } of filas) {
    resultado.set(contextoId, {
      usosSemana: Math.round((10 * ocasiones) / semanas) / 10,
      pctNoche: ocasiones === 0 ? null : Math.round((100 * noches) / ocasiones),
    });
  }
  return resultado;
}

/** «5», «0,5», «1,3»: como se escribe una frecuencia en pantalla. */
export const formatearFrecuencia = (n: number): string =>
  (Math.round(10 * n) / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 });

/* ------------------------------------------------------- configuracion */

/** Tope de usos por semana: dos al dia (dia y noche), los siete dias. */
export const MAXIMO_USOS_SEMANA = 14;

export interface AjusteContexto {
  momentos: Momento[];
  usosSemana: number | null;
  pctNoche: number;
}

/**
 * Lee lo que llega del formulario de un contexto. Los usos admiten coma
 * («0,5») y vacio (sin decir). Sin ningun momento marcado no se guarda: un
 * contexto que no existe ni de dia ni de noche no existe.
 */
export function leerAjusteContexto(entrada: {
  momentos: readonly string[];
  usosSemana: string;
  pctNoche: string;
}): { ok: true; ajuste: AjusteContexto } | { ok: false; error: string } {
  const momentos = TODOS.filter((m) => entrada.momentos.includes(m));
  if (momentos.length === 0) return { ok: false, error: 'necesita al menos un momento' };

  const textoUsos = entrada.usosSemana.trim().replace(',', '.');
  let usosSemana: number | null = null;
  if (textoUsos !== '') {
    const n = Number(textoUsos);
    if (!Number.isFinite(n) || n < 0 || n > MAXIMO_USOS_SEMANA) {
      return { ok: false, error: `las veces por semana van de 0 a ${MAXIMO_USOS_SEMANA}` };
    }
    usosSemana = Math.round(10 * n) / 10;
  }

  const textoNoche = entrada.pctNoche.trim().replace(',', '.');
  const pct = textoNoche === '' ? 50 : Number(textoNoche);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { ok: false, error: 'el % de noche va de 0 a 100' };
  }
  // Con un solo momento no cuenta, pero se guarda: si vuelve a tener los dos,
  // recupera el suyo.
  return { ok: true, ajuste: { momentos, usosSemana, pctNoche: Math.round(pct) } };
}
