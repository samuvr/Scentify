/**
 * Seccion 7.1 — Estacion efectiva por temperatura.
 *
 * El calendario es un mal proxy en clima mediterraneo: hay 26° en noviembre y
 * mañanas frescas en septiembre. La estacion se deduce del tiempo real y el
 * calendario queda como desempate y como fallback sin conexion.
 *
 * Funcion pura: la fecha y el clima entran por parametro, no se consulta ni el
 * reloj ni la red. Quien llama se encarga de traer el clima (cacheado, una
 * llamada al dia) y de pasar `null` si no hay.
 */
import type { Estacion, Momento, OrigenEstacion } from './tipos';

/** Los umbrales viven en la tabla `ajustes` y se editan desde configuracion. */
export interface UmbralesEstacion {
  /** A partir de aqui, solo VERANO. */
  umbralVerano: number;
  /** Desde aqui hasta `umbralVerano`: VERANO + entretiempo. */
  umbralVeranoEntretiempo: number;
  /** Desde aqui hasta `umbralVeranoEntretiempo`: solo entretiempo. */
  umbralEntretiempo: number;
  /** Desde aqui hasta `umbralEntretiempo`: entretiempo + INVIERNO. Por debajo, INVIERNO. */
  umbralEntretiempoInvierno: number;
  /** Humedad relativa media por encima de la cual hay bochorno costero. */
  bochornoHumedadPct: number;
  /** Temperatura minima para que el bochorno cuente. */
  bochornoTemperaturaMin: number;
  /** Grados que suma el bochorno. */
  bochornoIncremento: number;
}

/** Punto de partida, no una verdad. Se sobrescriben desde la tabla `ajustes`. */
export const UMBRALES_POR_DEFECTO: UmbralesEstacion = {
  umbralVerano: 28,
  umbralVeranoEntretiempo: 24,
  umbralEntretiempo: 18,
  umbralEntretiempoInvierno: 13,
  bochornoHumedadPct: 70,
  bochornoTemperaturaMin: 24,
  bochornoIncremento: 2,
};

export interface ClimaDia {
  temperaturaMax: number;
  temperaturaMin: number;
  humedadMedia?: number | null;
}

export interface ResultadoEstacionEfectiva {
  /** Una o dos estaciones, ordenadas de mas calida a mas fria. */
  estaciones: Estacion[];
  /** La mas calida del conjunto. Es la que agrupa en estadisticas. */
  dominante: Estacion;
  origen: OrigenEstacion;
  /** Temperatura con la que se decidio, ya ajustada por bochorno. Null si no hubo clima. */
  temperaturaUsada: number | null;
  ajusteBochorno: boolean;
  /** Siempre visible en la interfaz, y siempre sobrescribible por el usuario. */
  explicacion: string;
}

export interface OpcionesEstacionEfectiva {
  fecha: Date | string;
  momento: Momento;
  /** `null` cuando no hay conexion o la API falla: se cae al calendario. */
  clima?: ClimaDia | null;
  umbrales?: UmbralesEstacion;
  etiquetaUbicacion?: string;
}

const NOMBRE: Record<Estacion, string> = {
  PRIMAVERA: 'primavera',
  VERANO: 'verano',
  OTONO: 'otoño',
  INVIERNO: 'invierno',
};

/** Mes 1-12 en UTC, tanto de un Date como de un 'YYYY-MM-DD'. */
function mesDe(fecha: Date | string): number {
  if (typeof fecha === 'string') {
    const mes = Number(fecha.slice(5, 7));
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new RangeError(`Fecha no valida: ${fecha}`);
    }
    return mes;
  }
  return fecha.getUTCMonth() + 1;
}

/**
 * La estacion de entretiempo que toca segun la mitad del año: de enero a junio
 * se va hacia primavera, de julio a diciembre hacia otoño.
 */
export function entretiempoDeFecha(fecha: Date | string): Estacion {
  return mesDe(fecha) <= 6 ? 'PRIMAVERA' : 'OTONO';
}

/**
 * Estacion de calendario, la de verdad (meteorologica por mes). Es lo que se usa
 * como fallback sin conexion: caer a "otoño" un 15 de julio, que es lo que daria
 * la regla de entretiempo, seria absurdo.
 */
export function estacionPorCalendario(fecha: Date | string): Estacion {
  const mes = mesDe(fecha);
  if (mes === 12 || mes <= 2) return 'INVIERNO';
  if (mes <= 5) return 'PRIMAVERA';
  if (mes <= 8) return 'VERANO';
  return 'OTONO';
}

/** Redondea a un decimal para que el numero que se enseña y la banda coincidan. */
const redondear = (valor: number) => Math.round(valor * 10) / 10;

/** 28.5 -> "28,5"; 26 -> "26". */
const formatear = (valor: number) => String(redondear(valor)).replace('.', ',');

function bandaDe(t: number, entretiempo: Estacion, u: UmbralesEstacion): Estacion[] {
  if (t >= u.umbralVerano) return ['VERANO'];
  if (t >= u.umbralVeranoEntretiempo) return ['VERANO', entretiempo];
  if (t >= u.umbralEntretiempo) return [entretiempo];
  if (t >= u.umbralEntretiempoInvierno) return [entretiempo, 'INVIERNO'];
  return ['INVIERNO'];
}

/**
 * En el texto la banda mixta se lee mejor empezando por la estacion de
 * calendario: "otoño y verano", no "verano y otoño". El array, en cambio, va de
 * mas calido a mas frio para que la dominante sea siempre el primero.
 */
function enumerarEstaciones(estaciones: Estacion[], entretiempo: Estacion): string {
  const nombres = [...estaciones]
    .sort((a, b) => Number(b === entretiempo) - Number(a === entretiempo))
    .map((e) => NOMBRE[e]);
  const [primera, segunda] = nombres;
  if (!segunda) return primera ?? '';
  return `${primera} ${segunda.startsWith('i') ? 'e' : 'y'} ${segunda}`;
}

export function calcularEstacionEfectiva(
  opciones: OpcionesEstacionEfectiva,
): ResultadoEstacionEfectiva {
  const { fecha, momento, clima, etiquetaUbicacion } = opciones;
  const u = opciones.umbrales ?? UMBRALES_POR_DEFECTO;

  // Fallback obligatorio: sin datos de tiempo, calendario, y la interfaz lo dice.
  if (!clima) {
    const estacion = estacionPorCalendario(fecha);
    return {
      estaciones: [estacion],
      dominante: estacion,
      origen: 'CALENDARIO',
      temperaturaUsada: null,
      ajusteBochorno: false,
      explicacion: `Sin datos de tiempo, usando ${NOMBRE[estacion]} por fecha.`,
    };
  }

  const entretiempo = entretiempoDeFecha(fecha);
  const base = momento === 'DIA' ? clima.temperaturaMax : (clima.temperaturaMax + clima.temperaturaMin) / 2;

  const humedad = clima.humedadMedia ?? null;
  const ajusteBochorno =
    humedad !== null && humedad > u.bochornoHumedadPct && base >= u.bochornoTemperaturaMin;

  const t = redondear(ajusteBochorno ? base + u.bochornoIncremento : base);
  const estaciones = bandaDe(t, entretiempo, u);
  const dominante = estaciones[0] as Estacion;

  const donde = etiquetaUbicacion ? ` en ${etiquetaUbicacion}` : '';
  const listado = enumerarEstaciones(estaciones, entretiempo);
  const cierre = estaciones.length > 1 ? `${listado} compatibles` : listado;
  const bochorno = ajusteBochorno
    ? ` Con +${formatear(u.bochornoIncremento)}° por bochorno costero.`
    : '';

  return {
    estaciones,
    dominante,
    origen: 'TEMPERATURA',
    temperaturaUsada: t,
    ajusteBochorno,
    explicacion: `${formatear(t)}° hoy${donde} → ${cierre}.${bochorno}`,
  };
}
