/**
 * Seccion 10.1 — Deteccion de huecos.
 *
 * Cruza contextos x momentos x estaciones contra la coleccion y lista las
 * combinaciones que no cubre ningun perfume. Un contexto atemporal (el
 * gimnasio) es una sola casilla, sin momento ni estacion: alli da igual la hora
 * y la epoca del año. Con los seis contextos de las semillas son 5 x 2 x 4 + 1
 * = 41 combinaciones.
 *
 * "Cubrir" aqui significa exactamente lo mismo que idoneidad 100 en la 6.2: el
 * perfume esta marcado para ese contexto, ese momento y esa estacion. Si fuera
 * otra cosa, la pantalla de huecos diria que tienes cubierto algo que luego el
 * motor de recomendacion no te ofrece.
 */
import type { PerfumeCandidato } from './recomendacion';
import type { Estacion, Momento } from './tipos';

export const ESTACIONES: readonly Estacion[] = ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'];
export const MOMENTOS: readonly Momento[] = ['DIA', 'NOCHE'];

export interface Combinacion {
  contextoId: string;
  /** null en un contexto atemporal: la casilla vale para cualquier momento. */
  momento: Momento | null;
  /** null en un contexto atemporal: la casilla vale para cualquier estacion. */
  estacion: Estacion | null;
}

export interface CombinacionCubierta extends Combinacion {
  /** Cuantos perfumes la cubren. Un 1 es un hueco a medias: si lo vendes, se abre. */
  cuantos: number;
}

export interface ResultadoHuecos {
  huecos: Combinacion[];
  /** Cubiertas por un solo perfume: no son huecos, pero casi. */
  frageles: CombinacionCubierta[];
  totalCombinaciones: number;
  cubiertas: number;
}

/** Los mismos filtros duros que la recomendacion: lo que no tengo no cubre nada. */
const disponibles = (coleccion: PerfumeCandidato[]) =>
  coleccion.filter((p) => p.estado === 'LO_TENGO' && !p.archivado);

/** Las casillas de un contexto: una sola si es atemporal, momento x estacion si no. */
function combinacionesDe(contextoId: string, atemporal: boolean): Combinacion[] {
  if (atemporal) return [{ contextoId, momento: null, estacion: null }];
  return MOMENTOS.flatMap((momento) =>
    ESTACIONES.map((estacion) => ({ contextoId, momento, estacion })),
  );
}

const cubre = (p: PerfumeCandidato, c: Combinacion) =>
  p.contextos.includes(c.contextoId) &&
  (c.momento === null || p.momentos.includes(c.momento)) &&
  (c.estacion === null || p.estaciones.includes(c.estacion));

export function detectarHuecos(
  coleccion: PerfumeCandidato[],
  contextoIds: string[],
  /** Ids de los contextos atemporales (el gimnasio). */
  atemporales: readonly string[] = [],
): ResultadoHuecos {
  const utiles = disponibles(coleccion);

  const huecos: Combinacion[] = [];
  const frageles: CombinacionCubierta[] = [];
  let cubiertas = 0;
  let totalCombinaciones = 0;

  for (const contextoId of contextoIds) {
    for (const combinacion of combinacionesDe(contextoId, atemporales.includes(contextoId))) {
      totalCombinaciones += 1;
      const cuantos = utiles.filter((p) => cubre(p, combinacion)).length;

      if (cuantos === 0) huecos.push(combinacion);
      else {
        cubiertas += 1;
        if (cuantos === 1) frageles.push({ ...combinacion, cuantos });
      }
    }
  }

  return { huecos, frageles, totalCombinaciones, cubiertas };
}

/**
 * Agrupa los huecos por contexto. Cuarenta y una combinaciones en una lista
 * plana no se leen en un movil; por contexto, si.
 */
export function agruparPorContexto(huecos: Combinacion[]): Map<string, Combinacion[]> {
  const mapa = new Map<string, Combinacion[]>();
  for (const hueco of huecos) {
    const lista = mapa.get(hueco.contextoId) ?? [];
    lista.push(hueco);
    mapa.set(hueco.contextoId, lista);
  }
  return mapa;
}

/* ------------------------------------------------- ponderacion por uso real */

/** Cuantas veces te has puesto algo en una combinacion, sea lo que sea. */
export interface UsosDeCombinacion {
  contextoId: string;
  momento: Momento;
  estacion: Estacion;
  usos: number;
}

export interface HuecoPonderado extends Combinacion {
  /** Usos reales en esa combinacion durante la ventana mirada. */
  usos: number;
}

export interface HuecosPonderados {
  /** Huecos en los que te has encontrado de verdad, de mas a menos usos. */
  vividos: HuecoPonderado[];
  /** Huecos de combinaciones que no has vivido: existen, pero no apremian. */
  teoricos: Combinacion[];
  /**
   * Porcentaje de tus usos reales que caen en combinaciones cubiertas. Es la
   * cobertura que importa: todas las casillas pesan igual, tus dias no. null si no
   * hay usos en la ventana.
   */
  coberturaReal: number | null;
}

const claveDe = (c: Combinacion) => `${c.contextoId}|${c.momento}|${c.estacion}`;

/**
 * Los huecos no pesan igual: el de «Cita · Mañana · Verano» no apremia si
 * nunca tienes citas por la mañana. Se ordenan por cuantas veces has estado en
 * esa situacion, y los que nunca has vivido van aparte. En un contexto
 * atemporal todos los usos caen en su unica casilla, sea cual sea su momento y
 * su estacion.
 */
export function ponderarHuecos(
  resultado: Pick<ResultadoHuecos, 'huecos'>,
  usosPorCombinacion: UsosDeCombinacion[],
  atemporales: readonly string[] = [],
): HuecosPonderados {
  const usos = new Map<string, number>();
  for (const fila of usosPorCombinacion) {
    const clave = atemporales.includes(fila.contextoId)
      ? claveDe({ contextoId: fila.contextoId, momento: null, estacion: null })
      : claveDe(fila);
    usos.set(clave, (usos.get(clave) ?? 0) + fila.usos);
  }

  const vividos: HuecoPonderado[] = [];
  const teoricos: Combinacion[] = [];
  let usosEnHuecos = 0;
  for (const hueco of resultado.huecos) {
    const n = usos.get(claveDe(hueco)) ?? 0;
    if (n > 0) {
      vividos.push({ ...hueco, usos: n });
      usosEnHuecos += n;
    } else teoricos.push(hueco);
  }
  // Orden estable: a igualdad de usos, el orden de entrada (contexto, momento, estacion).
  vividos.sort((a, b) => b.usos - a.usos);

  const total = [...usos.values()].reduce((suma, n) => suma + n, 0);
  return {
    vividos,
    teoricos,
    coberturaReal: total === 0 ? null : Math.round((100 * (total - usosEnHuecos)) / total),
  };
}
