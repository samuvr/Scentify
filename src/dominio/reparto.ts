/**
 * Reparto de la coleccion por contexto, momento del dia y estacion.
 *
 * Los huecos dicen que casillas estan vacias; esto dice cuanto pesa cada una:
 * donde ya sobran frascos y comprar otro no aporta, y donde hay tan pocos que
 * te vendria bien un refuerzo. Las mismas casillas que los huecos: sin la
 * estacion, «Oficina · Día» parece bien servida aunque todo sea de verano.
 *
 * Un perfume marcado para varios contextos, momentos o estaciones cuenta en
 * cada casilla que cubre. Un contexto atemporal (el gimnasio) es una casilla
 * sola, igual que en los huecos.
 */
import type { PerfumeCandidato } from './recomendacion';
import type { Estacion, Momento } from './tipos';
import { ESTACIONES, MOMENTOS } from './huecos';

/**
 * Comparado con la media de casillas:
 * - vacia: ninguno.
 * - escasa: uno solo, o menos de la mitad de la media.
 * - normal: lo esperable.
 * - sobrecargada: al menos la media y media, y dos por encima de ella (con una
 *   media de 2, tener 3 no es sobrecargar nada).
 */
export type NivelReparto = 'vacia' | 'escasa' | 'normal' | 'sobrecargada';

export interface CasillaReparto {
  contextoId: string;
  /** null en un contexto atemporal: vale para cualquier momento. */
  momento: Momento | null;
  /** null en un contexto atemporal: vale para cualquier estacion. */
  estacion: Estacion | null;
  cuantos: number;
  nivel: NivelReparto;
}

export interface ResultadoReparto {
  /** Por contexto, en el orden de entrada; dentro, por momento y estacion. */
  casillas: CasillaReparto[];
  /** Perfumes por casilla de media, con un decimal. */
  media: number;
}

export interface ContextoReparto {
  id: string;
  atemporal: boolean;
}

export function nivelDe(cuantos: number, media: number): NivelReparto {
  if (cuantos === 0) return 'vacia';
  if (cuantos === 1 || cuantos < media / 2) return 'escasa';
  if (cuantos >= media * 1.5 && cuantos - media >= 2) return 'sobrecargada';
  return 'normal';
}

export function repartoPorContexto(
  coleccion: PerfumeCandidato[],
  contextos: ContextoReparto[],
): ResultadoReparto {
  // Lo mismo que cuenta en los huecos: lo que tengo y no he archivado.
  const utiles = coleccion.filter((p) => p.estado === 'LO_TENGO' && !p.archivado);

  const conteos = contextos.flatMap(({ id, atemporal }): Omit<CasillaReparto, 'nivel'>[] => {
    const delContexto = utiles.filter((p) => p.contextos.includes(id));
    if (atemporal) {
      return [{ contextoId: id, momento: null, estacion: null, cuantos: delContexto.length }];
    }
    return MOMENTOS.flatMap((momento) =>
      ESTACIONES.map((estacion) => ({
        contextoId: id,
        momento,
        estacion,
        cuantos: delContexto.filter(
          (p) => p.momentos.includes(momento) && p.estaciones.includes(estacion),
        ).length,
      })),
    );
  });

  const total = conteos.reduce((suma, c) => suma + c.cuantos, 0);
  const media = conteos.length === 0 ? 0 : total / conteos.length;

  return {
    casillas: conteos.map((c) => ({ ...c, nivel: nivelDe(c.cuantos, media) })),
    media: Math.round(10 * media) / 10,
  };
}
