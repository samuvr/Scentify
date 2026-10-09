/**
 * Calendario de registros: la cuadricula de un mes y como moverse entre meses.
 *
 * Todo en cadenas 'YYYY-MM' y 'YYYY-MM-DD' y aritmetica en UTC, igual que el
 * resto de fechas de la app: un dia es un dia del calendario del usuario, no
 * un instante, y asi no hay husos que lo desplacen.
 */

export const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** La semana empieza en lunes, como en un calendario de aqui. */
export const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** 'YYYY-MM' de un mes valido (meses 01-12, años de cuatro cifras). */
export function esMesIso(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor);
}

/** El mes si es valido; si no, undefined. */
export function mesOVacio(valor: unknown): string | undefined {
  return esMesIso(valor) ? valor : undefined;
}

/** Mes al que pertenece una fecha 'YYYY-MM-DD'. */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/** Suma (o resta) meses a un 'YYYY-MM'. */
export function desplazarMes(mes: string, meses: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const nuevo = total - anio * 12 + 1;
  return `${String(anio).padStart(4, '0')}-${String(nuevo).padStart(2, '0')}`;
}

export function diasDelMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Primer y ultimo dia del mes, para acotar la consulta. */
export function limitesDelMes(mes: string): { desde: string; hasta: string } {
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(diasDelMes(mes)).padStart(2, '0')}`,
  };
}

/** "Octubre 2026". */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return `${NOMBRES_MES[m - 1]} ${a}`;
}

/** "jueves, 9 de octubre de 2026". */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const semana = NOMBRES_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana}, ${d} de ${NOMBRES_MES[m - 1]!.toLowerCase()} de ${a}`;
}

export type EstadoDia = 'REGISTRADO' | 'SIN_REGISTRO' | 'FUTURO';

export interface DiaCalendario {
  fecha: string;
  dia: number;
  /** Cuantos usos hay apuntados ese dia. */
  usos: number;
  estado: EstadoDia;
  esHoy: boolean;
}

/**
 * Las semanas del mes, de lunes a domingo. Los huecos antes del dia 1 y
 * despues del ultimo son null: el calendario solo enseña el mes que toca.
 */
export function semanasDelMes(
  mes: string,
  usosPorFecha: ReadonlyMap<string, number>,
  hoy: string,
): (DiaCalendario | null)[][] {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  // getUTCDay: 0 es domingo; con la semana en lunes, el domingo va al final.
  const huecoInicial = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const celdas: (DiaCalendario | null)[] = Array.from({ length: huecoInicial }, () => null);

  for (let dia = 1; dia <= diasDelMes(mes); dia++) {
    const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
    const usos = usosPorFecha.get(fecha) ?? 0;
    celdas.push({
      fecha,
      dia,
      usos,
      estado: usos > 0 ? 'REGISTRADO' : fecha > hoy ? 'FUTURO' : 'SIN_REGISTRO',
      esHoy: fecha === hoy,
    });
  }
  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: (DiaCalendario | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}
