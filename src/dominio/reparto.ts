/**
 * Reparto de la coleccion por contexto, momento del dia y estacion.
 *
 * Los huecos dicen que casillas estan vacias; esto dice cuales van mas cojas
 * que el resto. Las mismas casillas que los huecos: sin la estacion,
 * «Oficina · Día» parece bien servida aunque todo sea de verano.
 *
 * No juzga si tienes muchos o pocos perfumes: en una coleccion grande todas
 * las casillas tienen mas frascos de los que el uso pide, y decirlo en todas no
 * dice nada. Compara las casillas entre si, teniendo en cuenta cuanto se usa
 * cada una: cinco perfumes para la oficina (cinco dias a la semana) cubren
 * menos que cinco para ocasiones elegantes (dos veces al mes). El calculo:
 *
 * 1. Cada casilla pesa la raiz cuadrada de los usos por semana de su contexto,
 *    por la parte que cae en su momento (segun el % de noche). Raiz y no
 *    proporcion: un contexto diez veces mas usado merece mas frascos, pero no
 *    diez veces mas; en los que se usan poco tambien apetece variedad. Cada
 *    estacion pesa lo mismo (cada una necesita su propio juego).
 * 2. La cobertura de una casilla es cuantos tiene por unidad de peso. La
 *    referencia es la mediana de esas coberturas: lo normal en tu coleccion.
 * 3. Lo esperado en una casilla es lo que tendria con la cobertura de
 *    referencia, y al menos un frasco si se usa. Con esa vara se mide:
 *    escasa es ir bastante por detras del resto; holgada, bastante por
 *    delante.
 *
 * Como se compara con tu propia coleccion, crecer por igual en todas partes no
 * cambia nada; lo que cambia el reparto es comprar para unas casillas y no
 * para otras.
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
 * Comparado con lo esperado para la casilla (lo que tendria si estuviera tan
 * cubierta como lo normal en tu coleccion):
 * - vacia: ninguno.
 * - escasa: menos de la mitad de lo esperado, o uno solo donde se esperan dos
 *   o mas.
 * - normal: en linea con el resto.
 * - holgada: al menos una vez y media lo esperado, y dos por encima (con dos
 *   esperados, tener tres no es ir sobrado).
 * - sin-uso: el contexto no se usa en ese momento (0 veces, o 0 % de noche).
 * - sin-frecuencia: el contexto no tiene dicho cuanto se usa; no se juzga.
 */
export type NivelReparto = 'vacia' | 'escasa' | 'normal' | 'holgada' | 'sin-uso' | 'sin-frecuencia';

export interface CasillaReparto {
  contextoId: string;
  /** null en un contexto atemporal: vale para cualquier momento. */
  momento: Momento | null;
  /** null en un contexto atemporal: vale para cualquier estacion. */
  estacion: Estacion | null;
  cuantos: number;
  /**
   * Frascos que tendria si estuviera tan cubierta como lo normal en tu
   * coleccion, con un decimal. null sin frecuencia.
   */
  esperado: number | null;
  /**
   * Cuantos tiene frente a lo esperado: 1 es ir como el resto, 0,5 la mitad,
   * 2 el doble. null sin frecuencia o sin uso.
   */
  cobertura: number | null;
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
  if (cuantos >= esperado * 1.5 && cuantos - esperado >= 2) return 'holgada';
  return 'normal';
}

const usa = (c: ContextoReparto) => c.usosSemana !== null && c.usosSemana > 0;

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[mitad]! : (orden[mitad - 1]! + orden[mitad]!) / 2;
}

/** Una casilla antes de compararla con las demas. */
interface Bruta {
  c: ContextoReparto;
  momento: Momento | null;
  estacion: Estacion | null;
  cuantos: number;
  /** Usos por semana en la casilla; null sin frecuencia. */
  usosSemana: number | null;
  /** Raiz de los usos del contexto por la parte del momento. 0 si no se usa. */
  peso: number;
}

export function repartoPorContexto(
  coleccion: PerfumeCandidato[],
  contextos: ContextoReparto[],
): ResultadoReparto {
  // Lo mismo que cuenta en los huecos: lo que tengo y no he archivado.
  const utiles = coleccion.filter((p) => p.estado === 'LO_TENGO' && !p.archivado);

  const idsConFrecuencia = new Set(contextos.filter(usa).map((c) => c.id));
  const frascos = utiles.filter((p) => p.contextos.some((id) => idsConFrecuencia.has(id))).length;

  const bruta = (
    c: ContextoReparto,
    momento: Momento | null,
    estacion: Estacion | null,
    cuantos: number,
  ): Bruta => {
    if (c.usosSemana === null) {
      return { c, momento, estacion, cuantos, usosSemana: null, peso: 0 };
    }
    const fraccion = momento === null ? 1 : fraccionDelMomento(c, momento);
    const usosSemana = Math.max(0, c.usosSemana * fraccion);
    return {
      c,
      momento,
      estacion,
      cuantos,
      usosSemana,
      peso: Math.sqrt(Math.max(0, c.usosSemana)) * fraccion,
    };
  };

  const brutas = contextos.flatMap((c): Bruta[] => {
    const delContexto = utiles.filter((p) => p.contextos.includes(c.id));
    if (c.atemporal) return [bruta(c, null, null, delContexto.length)];
    return momentosDe(c).flatMap((momento) =>
      ESTACIONES.map((estacion) =>
        bruta(
          c,
          momento,
          estacion,
          delContexto.filter((p) => p.momentos.includes(momento) && p.estaciones.includes(estacion))
            .length,
        ),
      ),
    );
  });

  // Lo normal en tu coleccion: la mediana de frascos por unidad de peso. Si
  // mas de la mitad estan vacias, la media, para que las que tienen algo no
  // parezcan todas holgadas.
  const juzgables = brutas.filter((b) => b.peso > 0);
  const coberturas = juzgables.map((b) => b.cuantos / b.peso);
  const referencia =
    mediana(coberturas) ||
    (coberturas.length === 0 ? 0 : coberturas.reduce((s, x) => s + x, 0) / coberturas.length);

  const casillas = brutas.map(
    ({ c, momento, estacion, cuantos, usosSemana, peso }): CasillaReparto => {
      const base = { contextoId: c.id, momento, estacion, cuantos };
      if (usosSemana === null) {
        return {
          ...base,
          esperado: null,
          cobertura: null,
          usosSemana: null,
          diasEntreUsos: null,
          nivel: 'sin-frecuencia',
        };
      }
      if (peso <= 0 || usosSemana <= 0) {
        return {
          ...base,
          esperado: 0,
          cobertura: null,
          usosSemana: 0,
          diasEntreUsos: null,
          nivel: 'sin-uso',
        };
      }
      const esperado = Math.max(MINIMO_ESPERADO, referencia * peso);
      return {
        ...base,
        esperado: Math.round(10 * esperado) / 10,
        cobertura: Math.round(100 * (cuantos / esperado)) / 100,
        usosSemana: Math.round(100 * usosSemana) / 100,
        diasEntreUsos: cuantos === 0 ? null : Math.round((7 * cuantos) / usosSemana),
        nivel: nivelDe(cuantos, esperado),
      };
    },
  );

  return { casillas, frascos };
}

/** «cada 4 días», «cada ~3 semanas», «cada ~4 meses»: legible en el movil. */
export function describirRotacion(dias: number): string {
  if (dias <= 1) return 'cada día';
  if (dias < 14) return `cada ${dias} días`;
  if (dias < 60) return `cada ~${Math.round(dias / 7)} semanas`;
  return `cada ~${Math.round(dias / 30)} meses`;
}
