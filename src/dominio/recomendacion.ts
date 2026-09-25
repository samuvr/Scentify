/**
 * Seccion 7.2 — Motor de recomendacion.
 *
 * Pregunta solo momento y contexto; la estacion viene calculada de la 7.1.
 *
 * Filtros duros: estado = LO_TENGO y no archivado. Un perfume marcado LO_TUVE
 * desaparece de aqui pero no se toca ni un dato de las estadisticas (criterio 9).
 *
 * Decidido con el usuario: los perfumes sin ningun registro salen SOLO en el
 * bloque "Nunca los has usado"; la lista principal ordena unicamente perfumes
 * con historial, por dias desde el ultimo uso, de mas a menos.
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
  hoy: Date | string;
  /** Ids descartados hoy con el boton "Otro". */
  descartados?: string[];
  /** Por defecto 3. */
  limite?: number;
  /** Nombre del contexto elegido, para la explicacion en texto. */
  nombreContexto?: string;
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
  /** Hasta 3 perfumes de la coleccion con cero registros que pasan los filtros duros. */
  nuncaUsados: PerfumeCandidato[];
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

  if (diasSinUsar === 0) {
    partes.push('Te lo has puesto hoy');
  } else if (diasSinUsar !== null) {
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

/** Mas tiempo sin usar primero; a igualdad, por nombre, para que el orden sea estable. */
function porTiempoSinUsar(a: Recomendacion, b: Recomendacion): number {
  return (b.diasSinUsar ?? 0) - (a.diasSinUsar ?? 0) || a.perfume.nombre.localeCompare(b.perfume.nombre, 'es');
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

  // Manda la fecha de ultimo uso: es el dato que ordena la lista principal.
  const conHistorial = disponibles.filter((p) => p.ultimoUso !== null).map(evaluar);

  const totales = conHistorial.filter((r) => r.idoneidad.pct === 100).sort(porTiempoSinUsar);
  const parciales = conHistorial.filter((r) => r.idoneidad.pct === 67).sort(porTiempoSinUsar);

  // Las totales primero; las parciales solo completan si faltan huecos.
  const recomendaciones = [...totales, ...parciales].slice(0, limite);

  // Bloque aparte: solo filtros duros, sin exigir idoneidad. Se ordena por
  // idoneidad y luego por nombre para que la lista sea estable.
  const nuncaUsados = disponibles
    .filter((p) => p.ultimoUso === null)
    .map(evaluar)
    .sort(
      (a, b) =>
        b.idoneidad.pct - a.idoneidad.pct ||
        a.perfume.nombre.localeCompare(b.perfume.nombre, 'es'),
    )
    .slice(0, limite)
    .map((r) => r.perfume);

  return { recomendaciones, nuncaUsados };
}
