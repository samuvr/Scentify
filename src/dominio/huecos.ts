/**
 * Seccion 10.1 — Deteccion de huecos.
 *
 * Cruza contextos x momentos x estaciones contra la coleccion y lista las
 * combinaciones que no cubre ningun perfume. Con los seis contextos de las
 * semillas son 6 x 2 x 4 = 48 combinaciones.
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
  momento: Momento;
  estacion: Estacion;
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

export function detectarHuecos(
  coleccion: PerfumeCandidato[],
  contextoIds: string[],
): ResultadoHuecos {
  const utiles = disponibles(coleccion);

  const huecos: Combinacion[] = [];
  const frageles: CombinacionCubierta[] = [];
  let cubiertas = 0;

  for (const contextoId of contextoIds) {
    for (const momento of MOMENTOS) {
      for (const estacion of ESTACIONES) {
        const cuantos = utiles.filter(
          (p) =>
            p.contextos.includes(contextoId) &&
            p.momentos.includes(momento) &&
            p.estaciones.includes(estacion),
        ).length;

        if (cuantos === 0) huecos.push({ contextoId, momento, estacion });
        else {
          cubiertas += 1;
          if (cuantos === 1) frageles.push({ contextoId, momento, estacion, cuantos });
        }
      }
    }
  }

  return {
    huecos,
    frageles,
    totalCombinaciones: contextoIds.length * MOMENTOS.length * ESTACIONES.length,
    cubiertas,
  };
}

/**
 * Agrupa los huecos por contexto. Cuarenta y ocho combinaciones en una lista
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
