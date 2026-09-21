/**
 * Seccion 6.2 — Calculo de idoneidad.
 *
 * Tres ejes independientes, cada uno vale un tercio. Funcion pura: las mismas
 * entradas dan siempre la misma salida y no se toca nada de lo que entra, que es
 * lo que permite guardar el resultado como snapshot y que el historico no se
 * mueva aunque el perfume se reconfigure despues (criterio 10).
 *
 * La idoneidad informa, nunca bloquea: ante cualquier entrada, incluso vacia,
 * devuelve un resultado valido con su desglose en vez de lanzar.
 */
import type {
  ColorIdoneidad,
  CondicionesUso,
  EjesIdoneidad,
  EtiquetaIdoneidad,
  Momento,
  PerfumeIdoneidad,
  PorcentajeIdoneidad,
} from './tipos';

export interface Idoneidad {
  pct: PorcentajeIdoneidad;
  detalle: EjesIdoneidad;
  etiqueta: EtiquetaIdoneidad;
  color: ColorIdoneidad;
  /** Desglose en texto. Nunca se enseña el numero solo. */
  explicacion: string;
}

const ESCALA: Record<PorcentajeIdoneidad, { etiqueta: EtiquetaIdoneidad; color: ColorIdoneidad }> = {
  100: { etiqueta: 'Total', color: 'verde' },
  67: { etiqueta: 'Alta', color: 'verde-claro' },
  33: { etiqueta: 'Parcial', color: 'ambar' },
  0: { etiqueta: 'Nula', color: 'rojo' },
};

const MOMENTO_LEGIBLE: Record<Momento, string> = { DIA: 'día', NOCHE: 'noche' };

const EJE_LEGIBLE: Record<keyof EjesIdoneidad, string> = {
  momento: 'momento',
  contexto: 'contexto',
  estacion: 'estación',
};

/** Une una lista en castellano: "a", "a y b", "a, b y c". */
function enumerar(partes: string[], conjuncion = 'y'): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} ${conjuncion} ${partes.at(-1)}`;
}

export function calcularIdoneidad(
  perfume: PerfumeIdoneidad,
  condiciones: CondicionesUso,
): Idoneidad {
  const detalle: EjesIdoneidad = {
    momento: perfume.momentos.includes(condiciones.momento),
    contexto: perfume.contextos.includes(condiciones.contextoId),
    estacion: perfume.estaciones.some((e) => condiciones.estacionesCompatibles.includes(e)),
  };

  const aciertos = Number(detalle.momento) + Number(detalle.contexto) + Number(detalle.estacion);
  const pct = Math.round((100 * aciertos) / 3) as PorcentajeIdoneidad;
  const { etiqueta, color } = ESCALA[pct];

  return { pct, detalle, etiqueta, color, explicacion: explicar(perfume, detalle) };
}

/** Por que falla cada eje, con el detalle util: "lo tienes marcado solo para noche". */
function motivoDelFallo(perfume: PerfumeIdoneidad, eje: keyof EjesIdoneidad): string {
  switch (eje) {
    case 'momento': {
      const [unico] = perfume.momentos;
      return perfume.momentos.length === 1 && unico
        ? `lo tienes marcado solo para ${MOMENTO_LEGIBLE[unico]}`
        : 'no lo tienes marcado para ningún momento';
    }
    case 'contexto':
      return 'no lo tienes marcado para este contexto';
    case 'estacion':
      return 'no lo tienes marcado para la estación de hoy';
  }
}

function explicar(perfume: PerfumeIdoneidad, detalle: EjesIdoneidad): string {
  const ejes = ['momento', 'contexto', 'estacion'] as const;
  const aciertos = ejes.filter((eje) => detalle[eje]);
  const fallos = ejes.filter((eje) => !detalle[eje]);

  if (fallos.length === 0) return 'Encaja en momento, contexto y estación.';

  const motivos = enumerar(fallos.map((eje) => motivoDelFallo(perfume, eje)));
  if (aciertos.length === 0) return `No encaja hoy: ${motivos}.`;

  // "Encaja en contexto y en estación, pero ...": el "en" se repite en cada eje.
  const encaje = enumerar(aciertos.map((eje) => `en ${EJE_LEGIBLE[eje]}`));
  return `Encaja ${encaje}, pero ${motivos}.`;
}
