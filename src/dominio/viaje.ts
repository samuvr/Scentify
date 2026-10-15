/**
 * Seccion 10.3 — Modo viaje.
 *
 * Dados los contextos previstos de dia y de noche, las fechas y el destino,
 * propone el set minimo de frascos que los cubre. Es un problema de cobertura de conjuntos: NP-duro en general,
 * pero aqui el tamaño lo hace tratable de forma EXACTA, y un resultado exacto
 * importa —"llevate tres" cuando bastaban dos es justo lo que no quieres en una
 * maleta—.
 *
 * Los numeros reales: seis contextos por dos momentos son doce requisitos, o
 * sea 4096 subconjuntos. Se resuelve por programacion dinamica sobre mascaras
 * de bits, ramificando solo por el primer requisito sin cubrir, que es la poda
 * clasica de este problema. Por encima de veinte requisitos se cae a voraz, que
 * no garantiza el minimo pero no se cuelga.
 *
 * "Cubrir" es idoneidad 100 (6.2): mismo criterio que la recomendacion y que la
 * deteccion de huecos, para que las tres pantallas no se contradigan.
 */
import type { PerfumeCandidato } from './recomendacion';
import type { Estacion, Momento } from './tipos';

export interface RequisitoViaje {
  contextoId: string;
  momento: Momento;
  /**
   * Solo cuando el tiempo cambia a lo largo del viaje: el conjunto de
   * estaciones de ese tramo. Sin el, vale `estacionesCompatibles`.
   */
  estaciones?: Estacion[];
}

export interface PeticionViaje {
  coleccion: PerfumeCandidato[];
  /**
   * Contextos previstos para cada momento: los del dia no tienen por que ser
   * los de la noche (oficina de dia, cena de noche). Si se da, manda sobre
   * `contextoIds` y `momentos`.
   */
  contextosPorMomento?: Partial<Record<Momento, string[]>>;
  /** Contextos previstos en el viaje, los mismos para todos los momentos. */
  contextoIds?: string[];
  /** Momentos a cubrir con `contextoIds`. Por defecto, dia y noche. */
  momentos?: Momento[];
  /** Estaciones compatibles EN EL DESTINO, no en casa (7.1). */
  estacionesCompatibles: Estacion[];
  /**
   * Si el viaje dura varios dias, los conjuntos de estaciones DISTINTOS que van
   * saliendo para cada momento. Cada uno es un requisito aparte: un frasco de
   * verano no cubre los dias frios del final de un viaje de septiembre.
   */
  estacionesPorMomento?: Partial<Record<Momento, Estacion[][]>>;
  /** Frascos que quieres llevar como poco, aunque menos ya lo cubran todo. */
  minimoFrascos?: number;
  /** Tope de frascos que caben en la maleta. Sin tope, el minimo que salga. */
  maximoFrascos?: number;
}

export interface FrascoElegido {
  perfume: PerfumeCandidato;
  /**
   * Requisitos que cubre este frasco y ningun otro de los elegidos antes. En
   * los de refuerzo, todos los que cubre: ahi no hay nada nuevo que repartir.
   */
  cubre: RequisitoViaje[];
  /** Va para llegar al minimo pedido, no porque haga falta para cubrir algo. */
  deRefuerzo?: boolean;
}

export interface ResultadoViaje {
  frascos: FrascoElegido[];
  /** Requisitos que no cubre nada de la coleccion, o que no caben en el tope. */
  sinCubrir: RequisitoViaje[];
  /** true si el resultado es el minimo demostrado, false si es una aproximacion. */
  esOptimo: boolean;
  /** Frascos que faltan para el minimo pedido porque no hay mas que encajen. */
  faltanParaMinimo: number;
}

/** Por encima de esto, el exacto deja de ser barato y se usa voraz. */
const MAXIMO_REQUISITOS_EXACTO = 20;

const MOMENTOS_POR_DEFECTO: Momento[] = ['DIA', 'NOCHE'];

/**
 * Orden de preferencia entre frascos que cubren lo mismo: primero el que mejor
 * valoras, luego el que mas usas, y el nombre como desempate para que dos
 * consultas iguales den la misma maleta.
 */
function compararPreferencia(a: PerfumeCandidato, b: PerfumeCandidato): number {
  return (
    (b.promedios?.valoracionMedia ?? 0) - (a.promedios?.valoracionMedia ?? 0) ||
    b.vecesUsado - a.vecesUsado ||
    a.nombre.localeCompare(b.nombre, 'es')
  );
}

const contarBits = (n: number): number => {
  let total = 0;
  for (let m = n; m !== 0; m &= m - 1) total += 1;
  return total;
};

/** Mismo conjunto de estaciones, venga en el orden que venga. */
const claveEstaciones = (estaciones: Estacion[]) => [...estaciones].sort().join(',');

/**
 * Los conjuntos de estaciones distintos, sin repetir. Es lo que hay que pasar
 * en `estacionesPorMomento` a partir de la estacion efectiva de cada dia.
 */
export function estacionesDistintas(porDia: Estacion[][]): Estacion[][] {
  const vistas = new Map<string, Estacion[]>();
  for (const estaciones of porDia) {
    if (estaciones.length === 0) continue;
    const clave = claveEstaciones(estaciones);
    if (!vistas.has(clave)) vistas.set(clave, estaciones);
  }
  return [...vistas.values()];
}

/** Dias de un viaje contando el de ida y el de vuelta. 0 si las fechas no casan. */
export function diasDeViaje(desde: string, hasta: string): number {
  const inicio = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) return 0;
  return Math.round((fin - inicio) / 86_400_000) + 1;
}

function construirRequisitos(peticion: PeticionViaje): RequisitoViaje[] {
  const porMomento: Partial<Record<Momento, string[]>> =
    peticion.contextosPorMomento ??
    Object.fromEntries(
      (peticion.momentos?.length ? peticion.momentos : MOMENTOS_POR_DEFECTO).map((m) => [
        m,
        peticion.contextoIds ?? [],
      ]),
    );

  const requisitos: RequisitoViaje[] = [];
  for (const momento of MOMENTOS_POR_DEFECTO) {
    const contextoIds = [...new Set(porMomento[momento] ?? [])];
    const tramos = peticion.estacionesPorMomento?.[momento]?.filter((e) => e.length > 0);
    for (const contextoId of contextoIds) {
      if (tramos && tramos.length > 0) {
        for (const estaciones of tramos) requisitos.push({ contextoId, momento, estaciones });
      } else {
        requisitos.push({ contextoId, momento });
      }
    }
  }
  return requisitos;
}

export function resolverViaje(peticion: PeticionViaje): ResultadoViaje {
  const requisitos = construirRequisitos(peticion);
  if (requisitos.length === 0) {
    return { frascos: [], sinCubrir: [], esOptimo: true, faltanParaMinimo: 0 };
  }

  // Mismos filtros duros que la recomendacion, y ordenados por preferencia para
  // que los desempates del algoritmo sean los que quiero.
  const candidatos = peticion.coleccion
    .filter((p) => p.estado === 'LO_TENGO' && !p.archivado)
    .sort(compararPreferencia);

  const cubreRequisito = (p: PerfumeCandidato, r: RequisitoViaje) =>
    p.contextos.includes(r.contextoId) &&
    p.momentos.includes(r.momento) &&
    p.estaciones.some((e) => (r.estaciones ?? peticion.estacionesCompatibles).includes(e));

  const mascaras = candidatos.map((p) =>
    requisitos.reduce((m, r, i) => (cubreRequisito(p, r) ? m | (1 << i) : m), 0),
  );

  // Requisitos que no cubre nadie: se apartan antes de resolver, o el problema
  // no tendria solucion y no sabriamos por que.
  const alcanzable = mascaras.reduce((m, sub) => m | sub, 0);
  const imposibles = requisitos.filter((_, i) => (alcanzable & (1 << i)) === 0);
  const objetivo = alcanzable;

  const utiles = candidatos
    .map((perfume, i) => ({ perfume, mascara: mascaras[i] as number }))
    .filter((c) => c.mascara !== 0);

  const elegidos =
    requisitos.length <= MAXIMO_REQUISITOS_EXACTO
      ? cubrirExacto(utiles, objetivo)
      : cubrirVoraz(utiles, objetivo);

  const esOptimo = requisitos.length <= MAXIMO_REQUISITOS_EXACTO;

  // Tope de maleta: si el minimo no cabe, se queda con los que mas cubren.
  const tope = peticion.maximoFrascos;
  const finales =
    tope !== undefined && elegidos.length > tope
      ? recortarAlTope(utiles, objetivo, tope)
      : elegidos;

  // Se reparte cada requisito al primer frasco que lo cubre, para que la lista
  // diga por que va cada uno y no se repita la misma razon tres veces.
  let yaCubierto = 0;
  const frascos: FrascoElegido[] = [];
  for (const { perfume, mascara } of finales) {
    const nuevos = mascara & ~yaCubierto;
    yaCubierto |= mascara;
    frascos.push({
      perfume,
      cubre: requisitos.filter((_, i) => (nuevos & (1 << i)) !== 0),
    });
  }

  const sinCubrir = [
    ...imposibles,
    ...requisitos.filter((r, i) => (yaCubierto & (1 << i)) === 0 && !imposibles.includes(r)),
  ];

  // Minimo pedido: si con menos ya se cubre todo, se completa con los que mas
  // cosas cubren por su cuenta —un repuesto que sirve para mucho— y, a igual
  // cobertura, con el que prefieres. Nunca con uno que no encaja en el viaje.
  // El tope de maleta manda sobre el minimo.
  const minimo = Math.min(peticion.minimoFrascos ?? 0, tope ?? Number.POSITIVE_INFINITY);
  let faltanParaMinimo = 0;
  if (frascos.length < minimo) {
    const refuerzos = utiles
      .filter((c) => !finales.includes(c))
      .sort((a, b) => contarBits(b.mascara) - contarBits(a.mascara))
      .slice(0, minimo - frascos.length);
    for (const { perfume, mascara } of refuerzos) {
      frascos.push({
        perfume,
        cubre: requisitos.filter((_, i) => (mascara & (1 << i)) !== 0),
        deRefuerzo: true,
      });
    }
    faltanParaMinimo = minimo - frascos.length;
  }

  return {
    frascos,
    sinCubrir,
    esOptimo: esOptimo && (tope === undefined || elegidos.length <= tope),
    faltanParaMinimo,
  };
}

type Candidato = { perfume: PerfumeCandidato; mascara: number };

/**
 * Cobertura minima exacta.
 *
 * Solo se ramifica por los frascos que cubren el PRIMER requisito pendiente:
 * cualquier solucion tiene que incluir uno de ellos, asi que no se pierde el
 * optimo y el arbol se queda pequeño.
 */
function cubrirExacto(utiles: Candidato[], objetivo: number): Candidato[] {
  if (objetivo === 0) return [];

  const memoria = new Map<number, Candidato[]>();

  const resolver = (pendiente: number): Candidato[] => {
    if (pendiente === 0) return [];
    const guardado = memoria.get(pendiente);
    if (guardado) return guardado;

    // El primer requisito pendiente, de menor indice.
    const primero = pendiente & -pendiente;

    let mejor: Candidato[] | null = null;
    for (const candidato of utiles) {
      if ((candidato.mascara & primero) === 0) continue;
      const resto = resolver(pendiente & ~candidato.mascara);
      const propuesta = [candidato, ...resto];
      if (mejor === null || propuesta.length < mejor.length) mejor = propuesta;
    }

    // `utiles` esta ordenado por preferencia y se recorre en ese orden, asi que
    // entre dos soluciones del mismo tamaño gana la que encontro antes.
    const resultado = mejor ?? [];
    memoria.set(pendiente, resultado);
    return resultado;
  };

  return resolver(objetivo);
}

/** Voraz: en cada paso, el frasco que cubre mas requisitos pendientes. */
function cubrirVoraz(utiles: Candidato[], objetivo: number): Candidato[] {
  const elegidos: Candidato[] = [];
  let pendiente = objetivo;

  while (pendiente !== 0) {
    let mejor: Candidato | null = null;
    let mejorCuantos = 0;
    for (const candidato of utiles) {
      const cuantos = contarBits(candidato.mascara & pendiente);
      if (cuantos > mejorCuantos) {
        mejor = candidato;
        mejorCuantos = cuantos;
      }
    }
    if (!mejor) break;
    elegidos.push(mejor);
    pendiente &= ~mejor.mascara;
  }

  return elegidos;
}

/** Con tope de maleta: los N frascos que mas requisitos cubren entre todos. */
function recortarAlTope(utiles: Candidato[], objetivo: number, tope: number): Candidato[] {
  const elegidos: Candidato[] = [];
  let pendiente = objetivo;

  while (elegidos.length < tope && pendiente !== 0) {
    let mejor: Candidato | null = null;
    let mejorCuantos = 0;
    for (const candidato of utiles) {
      if (elegidos.includes(candidato)) continue;
      const cuantos = contarBits(candidato.mascara & pendiente);
      if (cuantos > mejorCuantos) {
        mejor = candidato;
        mejorCuantos = cuantos;
      }
    }
    if (!mejor) break;
    elegidos.push(mejor);
    pendiente &= ~mejor.mascara;
  }

  return elegidos;
}
