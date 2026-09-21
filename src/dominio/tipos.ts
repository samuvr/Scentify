/**
 * Tipos compartidos por la logica de dominio.
 *
 * Todo lo que hay en `src/dominio/` son funciones puras: sin red, sin base de
 * datos y sin reloj implicito (la fecha siempre entra por parametro). Es lo que
 * permite que el mismo calculo corra en el servidor al guardar un uso y en el
 * cliente al encolarlo sin conexion, y que se pueda testear sin levantar nada.
 */

export type Estacion = 'PRIMAVERA' | 'VERANO' | 'OTONO' | 'INVIERNO';

export type Momento = 'DIA' | 'NOCHE';

export type EstadoPerfume = 'LO_TENGO' | 'LO_TUVE';

export type DuracionPercibida = 'MENOS_2H' | 'DE_2_4H' | 'DE_4_6H' | 'DE_6_8H' | 'MAS_8H';

export type OrigenEstacion = 'TEMPERATURA' | 'CALENDARIO' | 'MANUAL';

/** Los cuatro valores posibles de idoneidad: round(100 * aciertos / 3). */
export type PorcentajeIdoneidad = 0 | 33 | 67 | 100;

export type EtiquetaIdoneidad = 'Nula' | 'Parcial' | 'Alta' | 'Total';

export type ColorIdoneidad = 'rojo' | 'ambar' | 'verde-claro' | 'verde';

/** Desglose por eje. Es lo que se guarda en `uso.idoneidad_detalle`. */
export interface EjesIdoneidad {
  momento: boolean;
  contexto: boolean;
  estacion: boolean;
}

/** Promedios historicos de un perfume (seccion 4.3). */
export interface PromediosPerfume {
  /** Media de sprays redondeada. */
  spraysHabituales: number | null;
  /** Moda de `duracion_percibida`. */
  duracionEsperada: DuracionPercibida | null;
  /** Media de `valoracion_dia`. */
  valoracionMedia: number | null;
}

/** Lo que la logica necesita saber de un perfume para calcular idoneidad. */
export interface PerfumeIdoneidad {
  /** Momentos marcados por el usuario. Minimo uno. */
  momentos: Momento[];
  /** Ids de contexto marcados por el usuario. Minimo uno. */
  contextos: string[];
  /** Estaciones marcadas por el usuario. Minimo una. */
  estaciones: Estacion[];
}

/** Las condiciones concretas contra las que se evalua un perfume. */
export interface CondicionesUso {
  momento: Momento;
  contextoId: string;
  /** Conjunto compatible que devuelve la seccion 7.1, no una sola estacion. */
  estacionesCompatibles: Estacion[];
}
