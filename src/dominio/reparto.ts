/**
 * Reparto de la coleccion por contexto, momento del dia y estacion.
 *
 * Los huecos dicen que casillas estan vacias; esto dice cuanto pesa cada una:
 * donde ya sobran frascos y comprar otro no aporta, y donde hay tan pocos que
 * te vendria bien un refuerzo. Las mismas casillas que los huecos: sin la
 * estacion, «Oficina · Día» parece bien servida aunque todo sea de verano.
 *
 * Cada casilla se mide contra lo que se usa, no contra una media global: cinco
 * perfumes para la oficina (cinco dias a la semana) estan bien; cinco para
 * ocasiones elegantes (dos veces al mes) son demasiados. El calculo:
 *
 * 1. Cada contexto pesa la raiz cuadrada de sus usos por semana. Raiz y no
 *    proporcion: un contexto diez veces mas usado merece mas frascos, pero no
 *    diez veces mas; en los que se usan poco tambien apetece variedad.
 * 2. Los frascos esperados de un contexto son su parte de ese peso por los
 *    frascos que tienes para contextos con frecuencia.
 * 3. Dentro del contexto se reparten por momento segun la parte de noche, y
 *    cada estacion espera lo mismo (cada una necesita su propio juego).
 * 4. Una casilla que se usa espera al menos un frasco.
 *
 * Un perfume marcado para varios contextos, momentos o estaciones cuenta en
 * cada casilla que cubre. Un contexto atemporal (el gimnasio) es una casilla
 * sola, igual que en los huecos. Un momento en que el contexto no existe (la
 * oficina de noche) no es casilla.
 */
import type { PerfumeCandidato } from './recomendacion';
import type { Estacion, Momento } from './tipos';
import { fraccionDelMomento, momentosDe, type FrecuenciaContexto } from './contextos';
import { ESTACIONES } from './huecos';

/**
 * Comparado con lo esperado para la casilla:
 * - vacia: ninguno.
 * - escasa: menos de la mitad de lo esperado, o uno solo donde se esperan dos
 *   o mas.
 * - normal: lo esperable.
 * - sobrecargada: al menos una vez y media lo esperado, y dos por encima (con
 *   dos esperados, tener tres no es sobrecargar nada).
 * - sin-uso: el contexto no se usa en ese momento (0 veces, o 0 % de noche).
 * - sin-frecuencia: el contexto no tiene dicho cuanto se usa; no se juzga.
 */
export type NivelReparto =
  | 'vacia'
  | 'escasa'
  | 'normal'
  | 'sobrecargada'
  | 'sin-uso'
  | 'sin-frecuencia';

export interface CasillaReparto {
  contextoId: string;
  /** null en un contexto atemporal: vale para cualquier momento. */
  momento: Momento | null;
  /** null en un contexto atemporal: vale para cualquier estacion. */
  estacion: Estacion | null;
  cuantos: number;
  /** Frascos que tocarian por lo que se usa, con un decimal. null sin frecuencia. */
  esperado: number | null;
  /** Usos por semana que caen en la casilla mientras esta activa. null sin frecuencia. */
  usosSemana: number | null;
  /**
   * Cada cuantos dias sale cada frasco de la casilla, si los rotas por igual.
   * null si no hay frascos o no se usa.
   */
  diasEntreUsos: number | null;
  nivel: NivelReparto;
}

export interface ResultadoReparto {
  /** Por contexto, en el orden de entrada; dentro, por momento y estacion. */
  casillas: CasillaReparto[];
  /** Frascos que entran en el calculo: los que tienes para algun contexto con frecuencia. */
  frascos: number;
}

export type ContextoReparto = FrecuenciaContexto;

/** Una casilla que se usa espera al menos esto. */
const MINIMO_ESPERADO = 1;

export function nivelDe(cuantos: number, esperado: number): NivelReparto {
  if (cuantos === 0) return 'vacia';
  if (cuantos < esperado / 2 || (cuantos === 1 && esperado >= 2)) return 'escasa';
  if (cuantos >= esperado * 1.5 && cuantos - esperado >= 2) return 'sobrecargada';
  return 'normal';
}

const usa = (c: ContextoReparto) => c.usosSemana !== null && c.usosSemana > 0;

export function repartoPorContexto(
  coleccion: PerfumeCandidato[],
  contextos: ContextoReparto[],
): ResultadoReparto {
  // Lo mismo que cuenta en los huecos: lo que tengo y no he archivado.
  const utiles = coleccion.filter((p) => p.estado === 'LO_TENGO' && !p.archivado);

  const conFrecuencia = contextos.filter(usa);
  const idsConFrecuencia = new Set(conFrecuencia.map((c) => c.id));
  const frascos = utiles.filter((p) => p.contextos.some((id) => idsConFrecuencia.has(id))).length;
  const pesoTotal = conFrecuencia.reduce((suma, c) => suma + Math.sqrt(c.usosSemana!), 0);

  /** Frascos esperados para todo el contexto, antes de repartir por momento. */
  const esperadoDelContexto = (c: ContextoReparto) =>
    pesoTotal === 0 ? 0 : (frascos * Math.sqrt(c.usosSemana!)) / pesoTotal;

  const casilla = (
    c: ContextoReparto,
    momento: Momento | null,
    estacion: Estacion | null,
    cuantos: number,
  ): CasillaReparto => {
    if (c.usosSemana === null) {
      return {
        contextoId: c.id,
        momento,
        estacion,
        cuantos,
        esperado: null,
        usosSemana: null,
        diasEntreUsos: null,
        nivel: 'sin-frecuencia',
      };
    }
    const fraccion = momento === null ? 1 : fraccionDelMomento(c, momento);
    const usosSemana = c.usosSemana * fraccion;
    if (usosSemana <= 0) {
      return {
        contextoId: c.id,
        momento,
        estacion,
        cuantos,
        esperado: 0,
        usosSemana: 0,
        diasEntreUsos: null,
        nivel: 'sin-uso',
      };
    }
    const esperado = Math.max(MINIMO_ESPERADO, esperadoDelContexto(c) * fraccion);
    return {
      contextoId: c.id,
      momento,
      estacion,
      cuantos,
      esperado: Math.round(10 * esperado) / 10,
      usosSemana: Math.round(100 * usosSemana) / 100,
      diasEntreUsos: cuantos === 0 ? null : Math.round((7 * cuantos) / usosSemana),
      nivel: nivelDe(cuantos, esperado),
    };
  };

  const casillas = contextos.flatMap((c): CasillaReparto[] => {
    const delContexto = utiles.filter((p) => p.contextos.includes(c.id));
    if (c.atemporal) return [casilla(c, null, null, delContexto.length)];
    return momentosDe(c).flatMap((momento) =>
      ESTACIONES.map((estacion) =>
        casilla(
          c,
          momento,
          estacion,
          delContexto.filter((p) => p.momentos.includes(momento) && p.estaciones.includes(estacion))
            .length,
        ),
      ),
    );
  });

  return { casillas, frascos };
}

/** «cada 4 días», «cada ~3 semanas», «cada ~4 meses»: legible en el movil. */
export function describirRotacion(dias: number): string {
  if (dias <= 1) return 'cada día';
  if (dias < 14) return `cada ${dias} días`;
  if (dias < 60) return `cada ~${Math.round(dias / 7)} semanas`;
  return `cada ~${Math.round(dias / 30)} meses`;
}
