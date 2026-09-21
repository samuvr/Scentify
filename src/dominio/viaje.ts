/**
 * Seccion 10.3 — Modo viaje.
 *
 * Dados unos contextos previstos y el destino, propone el set minimo de frascos
 * que los cubre. Es un problema de cobertura de conjuntos: NP-duro en general,
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
}

export interface PeticionViaje {
  coleccion: PerfumeCandidato[];
  /** Contextos previstos en el viaje. */
  contextoIds: string[];
  /** Momentos a cubrir. Por defecto, dia y noche. */
  momentos?: Momento[];
  /** Estaciones compatibles EN EL DESTINO, no en casa (7.1). */
  estacionesCompatibles: Estacion[];
  /** Tope de frascos que caben en la maleta. Sin tope, el minimo que salga. */
  maximoFrascos?: number;
}

export interface FrascoElegido {
  perfume: PerfumeCandidato;
  /** Requisitos que cubre este frasco y ningun otro de los elegidos antes. */
  cubre: RequisitoViaje[];
}

export interface ResultadoViaje {
  frascos: FrascoElegido[];
  /** Requisitos que no cubre nada de la coleccion, o que no caben en el tope. */
  sinCubrir: RequisitoViaje[];
  /** true si el resultado es el minimo demostrado, false si es una aproximacion. */
  esOptimo: boolean;
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

export function resolverViaje(peticion: PeticionViaje): ResultadoViaje {
  const momentos = peticion.momentos?.length ? peticion.momentos : MOMENTOS_POR_DEFECTO;

  const requisitos: RequisitoViaje[] = [];
  for (const contextoId of peticion.contextoIds) {
    for (const momento of momentos) requisitos.push({ contextoId, momento });
  }
  if (requisitos.length === 0) return { frascos: [], sinCubrir: [], esOptimo: true };

  // Mismos filtros duros que la recomendacion, y ordenados por preferencia para
  // que los desempates del algoritmo sean los que quiero.
  const candidatos = peticion.coleccion
    .filter((p) => p.estado === 'LO_TENGO' && !p.archivado)
    .sort(compararPreferencia);

  const cubreRequisito = (p: PerfumeCandidato, r: RequisitoViaje) =>
    p.contextos.includes(r.contextoId) &&
    p.momentos.includes(r.momento) &&
    p.estaciones.some((e) => peticion.estacionesCompatibles.includes(e));

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

  return {
    frascos,
    sinCubrir,
    esOptimo: esOptimo && (tope === undefined || elegidos.length <= tope),
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
