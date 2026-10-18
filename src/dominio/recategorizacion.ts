/**
 * Recategorizacion con evidencia: lo que haces frente a lo que marcaste.
 *
 * La recomendacion, los huecos y la tasa de acierto se calculan con las marcas
 * de cada perfume (contextos, momentos, estaciones), y la realidad se desvia:
 * un perfume marcado para Cita acaba siendo el de la Oficina. Aqui se comparan
 * los usos con las marcas ACTUALES —no con el snapshot de idoneidad de cada
 * uso, que es historia— y se proponen cambios concretos, uno a uno.
 *
 * Nada se aplica solo: son propuestas que el usuario confirma o rechaza.
 *
 * Funcion pura: recibe los usos ya cargados y no los muta.
 */
import { detectarHuecos } from './huecos';
import type { PerfumeCandidato } from './recomendacion';
import type { Estacion, Momento } from './tipos';

export type EjeMarca = 'contexto' | 'momento' | 'estacion';

export interface UsoParaEvidencia {
  /** 'YYYY-MM-DD'. */
  fecha: string;
  momento: Momento;
  contextoId: string;
  /** El conjunto compatible que se uso al registrar. */
  estaciones: Estacion[];
  /** Una estacion por calendario no dice nada del tiempo que hizo. */
  origenEstacion: 'TEMPERATURA' | 'CALENDARIO' | 'MANUAL';
  valoracionDia: number | null;
}

export interface DescarteParaEvidencia {
  fecha: string;
  contextoId: string | null;
  momento: Momento | null;
}

export interface MarcasActuales {
  contextos: string[];
  momentos: Momento[];
  estaciones: Estacion[];
}

export interface PropuestaMarca {
  eje: EjeMarca;
  /** Id del contexto, o el momento, o la estacion. */
  valor: string;
  accion: 'añadir' | 'quitar';
  motivo: 'usos' | 'sin-uso' | 'descartes';
  /** Usos que la respaldan (añadir) o usos del periodo sin ninguno ahi (quitar). */
  usos: number;
  /** Media de la valoracion de esos usos, si hay alguno valorado. */
  valoracionMedia: number | null;
  valorados: number;
  /** Veces descartado con «Otro» en esa combinacion. */
  descartes: number;
  /** Dias que cubre la evidencia (para decir «en 8 meses»). */
  dias: number;
  /** Para ordenar: lo que mas pesa, primero. */
  peso: number;
}

/** Una propuesta rechazada con «Fue casualidad», que no vuelve hasta `hasta`. */
export interface PropuestaRechazada {
  perfumeId: string;
  eje: EjeMarca;
  valor: string;
  /** 'YYYY-MM-DD'. */
  hasta: string;
}

/** Umbrales. Conservadores a proposito: marcar de mas empeora la recomendacion. */
export const REGLAS = {
  /** Ventana de los usos que cuentan para proponer añadir. */
  diasParaAñadir: 180,
  minimoUsosParaAñadir: 4,
  /** Con valoraciones, su media tiene que llegar a esto. */
  valoracionMinima: 3.5,
  /** Ventana para proponer quitar una marca sin uso. */
  diasParaQuitar: 365,
  /** Hace falta haberlo usado bastante para que no usarlo en algo diga algo. */
  minimoUsosParaQuitar: 5,
  /** Sin un periodo largo de historial, no haberlo usado en algo es azar. */
  minimoDiasDeHistorial: 120,
  /** Una estacion necesita haber pasado por todo el año. */
  minimoDiasDeHistorialEstacion: 300,
  minimoDescartes: 3,
  /** Lo que dura un «Fue casualidad». */
  diasDeRechazo: 90,
} as const;

const MS_POR_DIA = 86_400_000;

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA);
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
}

/** Fecha de hoy menos `dias`, como 'YYYY-MM-DD'. */
export function restarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** El valor que tiene un uso en cada eje (las estaciones pueden ser dos). */
function valoresDelUso(uso: UsoParaEvidencia, eje: EjeMarca): string[] {
  if (eje === 'contexto') return [uso.contextoId];
  if (eje === 'momento') return [uso.momento];
  return uso.estaciones;
}

function marcadosEn(marcas: MarcasActuales, eje: EjeMarca): string[] {
  if (eje === 'contexto') return marcas.contextos;
  if (eje === 'momento') return marcas.momentos;
  return marcas.estaciones;
}

/**
 * Las propuestas para un perfume, de mas a menos peso.
 *
 * - Añadir: al menos 4 usos en 180 dias con un valor que no esta marcado, y
 *   si estan valorados, con media de 3,5 o mas. Si los llevaste alli y no te
 *   gustaron, no se propone. En la estacion solo cuentan los usos con
 *   temperatura real o estacion elegida a mano, y solo los que fallaron en
 *   ese eje.
 * - Quitar: una marca sin ningun uso en el ultimo año, con el perfume en uso
 *   (5 o mas) y un historial lo bastante largo. Nunca deja un eje vacio.
 * - Quitar por descartes: 3 o mas «Otro» para un contexto marcado en 180
 *   dias, sin usos alli en ese tiempo que lo contradigan.
 */
export function desajustesDeMarcas(entrada: {
  perfumeId?: string;
  usos: UsoParaEvidencia[];
  marcas: MarcasActuales;
  descartes?: DescarteParaEvidencia[];
  hoy: string;
  rechazadas?: PropuestaRechazada[];
}): PropuestaMarca[] {
  const { usos, marcas, hoy } = entrada;
  const descartes = entrada.descartes ?? [];
  const propuestas: PropuestaMarca[] = [];

  const desdeAñadir = restarDias(hoy, REGLAS.diasParaAñadir);
  const recientes = usos.filter((u) => u.fecha >= desdeAñadir && u.fecha <= hoy);

  /* ---------------------------------------------------------------- añadir */
  for (const eje of ['contexto', 'momento', 'estacion'] as const) {
    const marcados = marcadosEn(marcas, eje);
    const conteo = new Map<string, UsoParaEvidencia[]>();
    for (const uso of recientes) {
      if (eje === 'estacion') {
        // Por calendario no es evidencia del tiempo que hizo; y si alguna de
        // sus estaciones ya esta marcada, ese uso no fallo en la estacion.
        if (uso.origenEstacion === 'CALENDARIO') continue;
        if (uso.estaciones.some((e) => marcados.includes(e))) continue;
      }
      for (const valor of valoresDelUso(uso, eje)) {
        if (marcados.includes(valor)) continue;
        const lista = conteo.get(valor) ?? [];
        lista.push(uso);
        conteo.set(valor, lista);
      }
    }
    for (const [valor, lista] of conteo) {
      if (lista.length < REGLAS.minimoUsosParaAñadir) continue;
      const valoradas = lista.map((u) => u.valoracionDia).filter((v): v is number => v !== null);
      const valoracionMedia = media(valoradas);
      if (valoracionMedia !== null && valoracionMedia < REGLAS.valoracionMinima) continue;
      propuestas.push({
        eje,
        valor,
        accion: 'añadir',
        motivo: 'usos',
        usos: lista.length,
        valoracionMedia,
        valorados: valoradas.length,
        descartes: 0,
        dias: REGLAS.diasParaAñadir,
        peso: lista.length + (valoracionMedia ?? 0),
      });
    }
  }

  /* ---------------------------------------------------- quitar por sin uso */
  const desdeQuitar = restarDias(hoy, REGLAS.diasParaQuitar);
  const delAño = usos.filter((u) => u.fecha >= desdeQuitar && u.fecha <= hoy);
  const primero = usos.reduce<string | null>((min, u) => (min === null || u.fecha < min ? u.fecha : min), null);
  const historial = primero ? Math.min(REGLAS.diasParaQuitar, diasEntre(primero, hoy)) : 0;

  if (delAño.length >= REGLAS.minimoUsosParaQuitar) {
    for (const eje of ['contexto', 'momento', 'estacion'] as const) {
      const marcados = marcadosEn(marcas, eje);
      // Quitar el unico que hay dejaria el eje vacio, y el perfume sin sitio.
      if (marcados.length < 2) continue;
      const minimo =
        eje === 'estacion' ? REGLAS.minimoDiasDeHistorialEstacion : REGLAS.minimoDiasDeHistorial;
      if (historial < minimo) continue;
      for (const valor of marcados) {
        const usado = delAño.some((u) => valoresDelUso(u, eje).includes(valor));
        if (usado) continue;
        propuestas.push({
          eje,
          valor,
          accion: 'quitar',
          motivo: 'sin-uso',
          usos: delAño.length,
          valoracionMedia: null,
          valorados: 0,
          descartes: 0,
          dias: historial,
          peso: delAño.length / 2,
        });
      }
    }
  }

  /* ------------------------------------------------- quitar por descartes */
  const descartesRecientes = descartes.filter((d) => d.fecha >= desdeAñadir && d.fecha <= hoy);
  const porContexto = new Map<string, number>();
  for (const d of descartesRecientes) {
    if (d.contextoId) porContexto.set(d.contextoId, (porContexto.get(d.contextoId) ?? 0) + 1);
  }
  for (const [contextoId, cuantos] of porContexto) {
    if (cuantos < REGLAS.minimoDescartes) continue;
    if (!marcas.contextos.includes(contextoId) || marcas.contextos.length < 2) continue;
    // Si a pesar de descartarlo te lo has puesto alli a menudo, no es rechazo.
    const usosAlli = recientes.filter((u) => u.contextoId === contextoId).length;
    if (usosAlli >= cuantos) continue;
    // Si ya se propone quitarlo por no usarlo, se junta en esa.
    const yaEsta = propuestas.find(
      (p) => p.eje === 'contexto' && p.valor === contextoId && p.accion === 'quitar',
    );
    if (yaEsta) {
      yaEsta.descartes = cuantos;
      yaEsta.peso += cuantos;
      continue;
    }
    propuestas.push({
      eje: 'contexto',
      valor: contextoId,
      accion: 'quitar',
      motivo: 'descartes',
      usos: usosAlli,
      valoracionMedia: null,
      valorados: 0,
      descartes: cuantos,
      dias: REGLAS.diasParaAñadir,
      peso: cuantos,
    });
  }

  const rechazadas = (entrada.rechazadas ?? []).filter(
    (r) => r.hasta >= hoy && (!entrada.perfumeId || r.perfumeId === entrada.perfumeId),
  );
  return propuestas
    .filter((p) => !rechazadas.some((r) => r.eje === p.eje && r.valor === p.valor))
    .sort((a, b) => b.peso - a.peso);
}

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};

const NOMBRE_MOMENTO: Record<Momento, string> = { DIA: 'Día', NOCHE: 'Noche' };

/** El nombre de un valor de marca para la pantalla. */
export function nombreDeValor(
  eje: EjeMarca,
  valor: string,
  nombreContexto: (id: string) => string,
): string {
  if (eje === 'contexto') return nombreContexto(valor);
  if (eje === 'momento') return NOMBRE_MOMENTO[valor as Momento] ?? valor;
  return NOMBRE_ESTACION[valor as Estacion] ?? valor;
}

function enPeriodo(dias: number): string {
  if (dias >= 330) return 'en el último año';
  const meses = Math.max(1, Math.round(dias / 30));
  return meses === 1 ? 'en el último mes' : `en ${meses} meses`;
}

/** «para Oficina», «de noche», «en verano». */
function dondeEs(eje: EjeMarca, nombre: string): string {
  if (eje === 'contexto') return `para ${nombre}`;
  if (eje === 'momento') return `de ${nombre.toLowerCase()}`;
  return `en ${nombre.toLowerCase()}`;
}

/**
 * La frase con la evidencia: «Te lo has puesto 10 veces para Oficina
 * (4,0/5) y no lo tienes marcado».
 */
export function explicarPropuesta(propuesta: PropuestaMarca, nombre: string): string {
  const donde = dondeEs(propuesta.eje, nombre);
  if (propuesta.accion === 'añadir') {
    const valoracion =
      propuesta.valoracionMedia !== null
        ? ` (${propuesta.valoracionMedia.toLocaleString('es-ES', { minimumFractionDigits: 1 })}/5)`
        : ' (sin valorar)';
    const veces = `${propuesta.usos} ${propuesta.usos === 1 ? 'vez' : 'veces'}`;
    return `Te lo has puesto ${veces} ${donde}${valoracion} y no lo tienes marcado.`;
  }
  if (propuesta.motivo === 'descartes') {
    return `Lo has descartado ${propuesta.descartes} veces ${donde} y casi no te lo pones así.`;
  }
  const extra = propuesta.descartes > 0 ? `, y lo has descartado ${propuesta.descartes} veces` : '';
  return `Marcado ${donde} y sin ponértelo ni una vez así ${enPeriodo(propuesta.dias)}${extra}.`;
}

/**
 * Cuantos huecos cerraria aplicar una propuesta de añadir: se mira la
 * coleccion como si ya estuviera aplicada. Usa la misma definicion de «cubrir»
 * que la deteccion de huecos y la recomendacion.
 */
export function huecosQueCierra(
  coleccion: PerfumeCandidato[],
  contextoIds: string[],
  propuesta: Pick<PropuestaMarca, 'eje' | 'valor' | 'accion'> & { perfumeId: string },
  atemporales: readonly string[] = [],
): number {
  if (propuesta.accion !== 'añadir') return 0;
  const antes = detectarHuecos(coleccion, contextoIds, atemporales).huecos.length;
  const modificada = coleccion.map((p) => {
    if (p.id !== propuesta.perfumeId) return p;
    if (propuesta.eje === 'contexto') return { ...p, contextos: [...p.contextos, propuesta.valor] };
    if (propuesta.eje === 'momento') return { ...p, momentos: [...p.momentos, propuesta.valor as Momento] };
    return { ...p, estaciones: [...p.estaciones, propuesta.valor as Estacion] };
  });
  return antes - detectarHuecos(modificada, contextoIds, atemporales).huecos.length;
}
