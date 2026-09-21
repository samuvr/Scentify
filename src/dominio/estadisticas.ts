/**
 * Seccion 8 — Aritmetica de las estadisticas.
 *
 * Aqui vive solo lo que se puede calcular sin base de datos: los rangos de
 * fecha de cada periodo, el periodo anterior equivalente, los indicadores
 * derivados y la comparativa. Las sumas y los rankings los hace SQL.
 */

export type Periodo = '30d' | '90d' | 'anio-en-curso' | '365d' | 'personalizado';

export interface RangoFechas {
  /** 'YYYY-MM-DD', incluido. */
  desde: string;
  /** 'YYYY-MM-DD', incluido. */
  hasta: string;
}

const MS_DIA = 86_400_000;

const aFecha = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function desplazar(iso: string, dias: number): string {
  return aIso(aFecha(iso) + dias * MS_DIA);
}

/** Dias que abarca un rango, contando los dos extremos. */
export function diasDelRango(rango: RangoFechas): number {
  return Math.round((aFecha(rango.hasta) - aFecha(rango.desde)) / MS_DIA) + 1;
}

/**
 * Rango de un periodo. Los periodos "de N dias" incluyen hoy, de modo que
 * "30 dias" son hoy y los 29 anteriores, no 31 dias.
 */
export function rangoDePeriodo(
  periodo: Periodo,
  hoy: string,
  personalizado?: Partial<RangoFechas>,
): RangoFechas {
  switch (periodo) {
    case '30d':
      return { desde: desplazar(hoy, -29), hasta: hoy };
    case '90d':
      return { desde: desplazar(hoy, -89), hasta: hoy };
    case '365d':
      return { desde: desplazar(hoy, -364), hasta: hoy };
    case 'anio-en-curso':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
    case 'personalizado':
      return {
        desde: personalizado?.desde ?? desplazar(hoy, -29),
        hasta: personalizado?.hasta ?? hoy,
      };
  }
}

/**
 * El periodo anterior equivalente: misma duracion, pegado justo antes. Para el
 * año en curso eso da la misma cantidad de dias terminando el 31 de diciembre
 * pasado, que es lo unico comparable cuando el año va por la mitad.
 */
export function periodoAnterior(rango: RangoFechas): RangoFechas {
  const dias = diasDelRango(rango);
  return { desde: desplazar(rango.desde, -dias), hasta: desplazar(rango.desde, -1) };
}

/** Indice de rotacion: perfumes distintos usados / total en coleccion. */
export function indiceRotacion(perfumesDistintos: number, totalColeccion: number): number {
  if (totalColeccion <= 0) return 0;
  return Math.round((100 * perfumesDistintos) / totalColeccion) / 100;
}

/** Tasa de acierto: proporcion de registros con idoneidad 100. */
export function tasaAcierto(idoneidades: number[]): number {
  if (idoneidades.length === 0) return 0;
  const totales = idoneidades.filter((pct) => pct === 100).length;
  return Math.round((100 * totales) / idoneidades.length);
}

export interface Indicadores {
  usos: number;
  perfumesDistintos: number;
  rotacion: number;
  tasaAcierto: number;
}

export interface Comparacion {
  actual: number;
  anterior: number;
  diferencia: number;
  /** null cuando el periodo anterior era cero: no hay porcentaje que calcular. */
  variacionPct: number | null;
}

/**
 * Redondeo simetrico respecto al cero. `Math.round` desempata siempre hacia
 * arriba, asi que una caida del 12,5 % saldria como -12 y una subida igual como
 * +13. En una comparativa esa asimetria no tiene ninguna gracia.
 */
function redondearSimetrico(valor: number): number {
  return Math.sign(valor) * Math.round(Math.abs(valor));
}

function comparar(actual: number, anterior: number): Comparacion {
  const diferencia = Math.round((actual - anterior) * 100) / 100;
  return {
    actual,
    anterior,
    diferencia,
    variacionPct:
      anterior === 0 ? null : redondearSimetrico((100 * (actual - anterior)) / anterior),
  };
}

/** Comparativa de los indicadores 1, 3 y 7 contra el periodo anterior. */
export function compararIndicadores(
  actual: Indicadores,
  anterior: Indicadores,
): Record<keyof Indicadores, Comparacion> {
  return {
    usos: comparar(actual.usos, anterior.usos),
    perfumesDistintos: comparar(actual.perfumesDistintos, anterior.perfumesDistintos),
    rotacion: comparar(actual.rotacion, anterior.rotacion),
    tasaAcierto: comparar(actual.tasaAcierto, anterior.tasaAcierto),
  };
}

/* ------------------------------------------------------------- heatmap */

export interface CeldaHeatmap {
  fecha: string;
  registros: number;
}

/**
 * Rejilla del heatmap anual, tipo calendario de contribuciones: semanas en
 * columnas, empezando en lunes. Devuelve todos los dias del rango, tambien los
 * que no tienen registro, para que la rejilla no tenga huecos.
 */
export function rejillaHeatmap(
  rango: RangoFechas,
  registrosPorDia: Map<string, number>,
): CeldaHeatmap[][] {
  // Se retrocede hasta el lunes anterior o igual al inicio.
  const inicio = aFecha(rango.desde);
  const diaSemana = (new Date(inicio).getUTCDay() + 6) % 7; // 0 = lunes
  const primerLunes = inicio - diaSemana * MS_DIA;
  const fin = aFecha(rango.hasta);

  const semanas: CeldaHeatmap[][] = [];
  for (let ms = primerLunes; ms <= fin; ms += 7 * MS_DIA) {
    const semana: CeldaHeatmap[] = [];
    for (let d = 0; d < 7; d += 1) {
      const fecha = aIso(ms + d * MS_DIA);
      semana.push({ fecha, registros: registrosPorDia.get(fecha) ?? 0 });
    }
    semanas.push(semana);
  }
  return semanas;
}
