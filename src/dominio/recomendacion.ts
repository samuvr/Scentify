/**
 * Seccion 7.2 — Motor de recomendacion.
 *
 * Pregunta solo momento y contexto; la estacion viene calculada de la 7.1.
 *
 * Filtros duros: estado = LO_TENGO y no archivado. Un perfume marcado LO_TUVE
 * desaparece de aqui pero no se toca ni un dato de las estadisticas (criterio 9).
 *
 * Una sola lista: de lo que hace mas tiempo que no te pones a lo mas reciente.
 * Los perfumes sin ningun registro entran en ella como los que mas tiempo
 * llevan sin usar (van primeros, como pide la 7.2). A igualdad de tiempo, el
 * orden se baraja, para no recomendar siempre el primero por orden alfabetico.
 *
 * Funcion pura: recibe la coleccion ya cargada y no la muta.
 */
import { calcularIdoneidad, type Idoneidad } from './idoneidad';
import type {
  DuracionPercibida,
  Estacion,
  EstadoPerfume,
  EjesIdoneidad,
  Momento,
  PromediosPerfume,
} from './tipos';

export interface PerfumeCandidato {
  id: string;
  nombre: string;
  marca: string;
  estado: EstadoPerfume;
  archivado: boolean;
  momentos: Momento[];
  contextos: string[];
  estaciones: Estacion[];
  /** 'YYYY-MM-DD' del ultimo uso, o null si nunca se ha usado. */
  ultimoUso: string | null;
  vecesUsado: number;
  promedios?: PromediosPerfume;
}

export interface PeticionRecomendacion {
  coleccion: PerfumeCandidato[];
  momento: Momento;
  contextoId: string;
  /** Conjunto compatible que devuelve la seccion 7.1. */
  estacionesCompatibles: Estacion[];
  /** El dia para el que se recomienda: hoy, o mañana si se planifica. */
  hoy: Date | string;
  /** true cuando `hoy` es mañana: cambia como se cuentan los dias en el motivo. */
  paraManana?: boolean;
  /** Ids descartados ese dia con el boton "Otro". */
  descartados?: string[];
  /** Por defecto 3. */
  limite?: number;
  /** Nombre del contexto elegido, para la explicacion en texto. */
  nombreContexto?: string;
  /**
   * Fuente de azar para desempatar, entre 0 y 1. Por defecto, una sembrada con
   * la fecha de hoy: el orden cambia de un dia a otro, pero no en cada recarga
   * ni al pulsar "Otro", que debe dejar entrar la siguiente de la misma lista.
   */
  aleatorio?: () => number;
}

export interface Recomendacion {
  perfume: PerfumeCandidato;
  idoneidad: Idoneidad;
  /** true cuando entra como coincidencia parcial (idoneidad 67). */
  parcial: boolean;
  diasSinUsar: number | null;
  /** Que ejes fallan, para marcarlo visualmente. */
  ejesQueFallan: (keyof EjesIdoneidad)[];
  /** La frase completa: por que este, y que esperar de el. */
  explicacion: string;
  /**
   * Solo el por que (tiempo sin usar y encaje), sin los promedios. Es lo que
   * pinta la tarjeta, que ya enseña los promedios aparte y no los repite.
   */
  motivo: string;
}

export interface ResultadoRecomendacion {
  recomendaciones: Recomendacion[];
}

const LIMITE_POR_DEFECTO = 3;

const MOMENTO_LEGIBLE: Record<Momento, string> = { DIA: 'Día', NOCHE: 'Noche' };

const ESTACION_LEGIBLE: Record<Estacion, string> = {
  PRIMAVERA: 'primavera',
  VERANO: 'verano',
  OTONO: 'otoño',
  INVIERNO: 'invierno',
};

const DURACION_LEGIBLE: Record<DuracionPercibida, string> = {
  MENOS_2H: 'menos de 2h',
  DE_2_4H: '2-4h',
  DE_4_6H: '4-6h',
  DE_6_8H: '6-8h',
  MAS_8H: 'más de 8h',
};

const MS_POR_DIA = 86_400_000;

/** Medianoche UTC de una fecha, venga como Date o como 'YYYY-MM-DD'. */
function aDiaUtc(fecha: Date | string): number {
  if (typeof fecha === 'string') return Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}

function diasEntre(desde: string, hasta: Date | string): number {
  return Math.round((aDiaUtc(hasta) - aDiaUtc(desde)) / MS_POR_DIA);
}

/** Baja la inicial de la explicacion de idoneidad para encajarla en una frase. */
function comoInciso(frase: string): string {
  return frase.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase());
}

function motivoDeRecomendacion(
  perfume: PerfumeCandidato,
  idoneidad: Idoneidad,
  diasSinUsar: number | null,
  peticion: PeticionRecomendacion,
): string[] {
  const partes: string[] = [];

  if (diasSinUsar === null) {
    partes.push('Aún no lo has estrenado');
  } else if (diasSinUsar === 0) {
    partes.push(peticion.paraManana ? 'Ya lo tienes apuntado para mañana' : 'Te lo has puesto hoy');
  } else if (diasSinUsar < 0) {
    // Un uso apuntado por adelantado deja el ultimo uso en el futuro.
    partes.push('Lo tienes apuntado para mañana');
  } else {
    partes.push(`Llevas ${diasSinUsar} ${diasSinUsar === 1 ? 'día' : 'días'} sin ponértelo`);
  }

  if (idoneidad.pct === 100) {
    const estacion = perfume.estaciones.find((e) => peticion.estacionesCompatibles.includes(e));
    const encaje = [
      peticion.nombreContexto,
      MOMENTO_LEGIBLE[peticion.momento],
      estacion ? ESTACION_LEGIBLE[estacion] : undefined,
    ].filter((x): x is string => Boolean(x));
    const [ultima, ...primeras] = [...encaje].reverse();
    const listado = primeras.length ? `${primeras.reverse().join(', ')} y ${ultima}` : ultima;
    if (listado) partes.push(`encaja con ${listado}`);
  } else {
    // En las parciales lo util es decir que eje falla, no repetir lo que encaja.
    partes.push(comoInciso(idoneidad.explicacion));
  }

  return partes;
}

function explicarRecomendacion(perfume: PerfumeCandidato, motivo: string[]): string {
  const partes = [...motivo];
  const { spraysHabituales, duracionEsperada } = perfume.promedios ?? {};
  if (spraysHabituales != null) partes.push(`sueles echarte ${spraysHabituales} sprays`);
  if (duracionEsperada) partes.push(`te suele durar ${DURACION_LEGIBLE[duracionEsperada]}`);

  return `${partes.join(' · ')}.`;
}

/** Generador pseudoaleatorio pequeño (mulberry32) sembrado con un texto. */
function azarSembrado(semilla: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nunca usado cuenta como el que mas tiempo lleva sin usar. */
const tiempoSinUsar = (r: Recomendacion) => r.diasSinUsar ?? Number.POSITIVE_INFINITY;

/**
 * Mas tiempo sin usar primero; a igualdad, al azar. Se baraja antes de ordenar
 * (el sort es estable), asi los empates quedan en el orden barajado.
 */
function ordenarPorTiempoSinUsar(lista: Recomendacion[], aleatorio: () => number): Recomendacion[] {
  // Partir de un orden fijo hace que la misma semilla de siempre el mismo resultado.
  const barajada = [...lista].sort((a, b) => a.perfume.id.localeCompare(b.perfume.id));
  for (let i = barajada.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [barajada[i], barajada[j]] = [barajada[j]!, barajada[i]!];
  }
  return barajada.sort((a, b) => {
    const [ta, tb] = [tiempoSinUsar(a), tiempoSinUsar(b)];
    return ta === tb ? 0 : tb > ta ? 1 : -1;
  });
}

export function recomendar(peticion: PeticionRecomendacion): ResultadoRecomendacion {
  const descartados = new Set(peticion.descartados ?? []);
  const limite = peticion.limite ?? LIMITE_POR_DEFECTO;

  const disponibles = peticion.coleccion.filter(
    (p) => p.estado === 'LO_TENGO' && !p.archivado && !descartados.has(p.id),
  );

  const evaluar = (perfume: PerfumeCandidato): Recomendacion => {
    const idoneidad = calcularIdoneidad(perfume, {
      momento: peticion.momento,
      contextoId: peticion.contextoId,
      estacionesCompatibles: peticion.estacionesCompatibles,
    });
    const diasSinUsar = perfume.ultimoUso ? diasEntre(perfume.ultimoUso, peticion.hoy) : null;
    const ejesQueFallan = (['momento', 'contexto', 'estacion'] as const).filter(
      (eje) => !idoneidad.detalle[eje],
    );
    const motivo = motivoDeRecomendacion(perfume, idoneidad, diasSinUsar, peticion);
    return {
      perfume,
      idoneidad,
      parcial: idoneidad.pct === 67,
      diasSinUsar,
      ejesQueFallan,
      explicacion: explicarRecomendacion(perfume, motivo),
      motivo: `${motivo.join(' · ')}.`,
    };
  };

  const evaluados = disponibles.map(evaluar);
  const aleatorio = peticion.aleatorio ?? azarSembrado(String(aDiaUtc(peticion.hoy)));
  const ordenados = ordenarPorTiempoSinUsar(evaluados, aleatorio);

  // Las totales primero; las parciales solo completan si faltan huecos.
  const totales = ordenados.filter((r) => r.idoneidad.pct === 100);
  const parciales = ordenados.filter((r) => r.idoneidad.pct === 67);
  const recomendaciones = [...totales, ...parciales].slice(0, limite);

  return { recomendaciones };
}
