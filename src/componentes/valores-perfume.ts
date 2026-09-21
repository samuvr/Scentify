/**
 * Forma del formulario de alta y edicion (seccion 4.1).
 *
 * Vive fuera de `FormularioPerfume.tsx` a proposito. Ese modulo lleva
 * 'use client', y Next no entrega a un Server Component los valores exportados
 * por un modulo de cliente: le pasa una referencia opaca. Al hacer
 * `{...VALORES_VACIOS}` desde el servidor salian cero propiedades y el
 * formulario recibia `estaciones`, `momentos`, `notas`, `familiaIds` y
 * `contextoIds` como undefined, con un TypeError en el primer `.length`.
 *
 * Al no declarar 'use client' aqui, este modulo es codigo compartido normal y
 * las dos partes ven el mismo objeto.
 */
import type { Estacion, Momento } from '@/dominio/tipos';

export type Nivel = 'SALIDA' | 'CORAZON' | 'FONDO';

export interface ValoresPerfume {
  nombre: string;
  marca: string;
  concentracion: string;
  anioLanzamiento: string;
  volumenMl: string;
  fechaCompra: string;
  estado: 'LO_TENGO' | 'LO_TUVE';
  valoracion: string;
  notasPersonales: string;
  fragranticaUrl: string;
  notas: { nombre: string; nivel: Nivel }[];
  familiaIds: string[];
  contextoIds: string[];
  estaciones: Estacion[];
  momentos: Momento[];
}

export const VALORES_VACIOS: ValoresPerfume = {
  nombre: '',
  marca: '',
  concentracion: '',
  anioLanzamiento: '',
  volumenMl: '',
  fechaCompra: '',
  estado: 'LO_TENGO',
  valoracion: '',
  notasPersonales: '',
  fragranticaUrl: '',
  notas: [],
  familiaIds: [],
  contextoIds: [],
  estaciones: [],
  momentos: [],
};
