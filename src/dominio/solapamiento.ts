/**
 * Seccion 10.2 — Solapamiento en la wishlist.
 *
 * Al añadir un deseo, si comparte tres o mas notas de fondo con perfumes que ya
 * tengo, se avisa. Avisa, no bloquea: a veces uno quiere justo el parecido.
 *
 * Se comparan las notas de FONDO y no la piramide entera a proposito: la salida
 * de dos perfumes puede coincidir en bergamota y no parecerse en nada. El fondo
 * es lo que queda a las cuatro horas y lo que hace que dos frascos sean
 * redundantes en una coleccion.
 */
import { normalizar } from './texto';

export interface PerfumeConFondo {
  id: string;
  nombre: string;
  marca: string;
  notasFondo: string[];
}

export interface Solapamiento {
  perfumeId: string;
  nombre: string;
  marca: string;
  /** Las notas compartidas, con la grafia del perfume que ya tengo. */
  comunes: string[];
}

export const MINIMO_NOTAS_COMUNES = 3;

/**
 * Notas de fondo que comparten un deseo y un perfume, comparando por nombre
 * normalizado para que "Ámbar" y "ambar" cuenten como la misma.
 */
export function notasComunes(notasDeseo: string[], notasPerfume: string[]): string[] {
  const delDeseo = new Set(notasDeseo.map(normalizar).filter(Boolean));
  const vistas = new Set<string>();
  const comunes: string[] = [];

  for (const nota of notasPerfume) {
    const clave = normalizar(nota);
    if (delDeseo.has(clave) && !vistas.has(clave)) {
      vistas.add(clave);
      comunes.push(nota);
    }
  }
  return comunes;
}

/**
 * Perfumes de la coleccion que se parecen al deseo, de mas parecido a menos.
 * A igualdad de notas comunes, por nombre, para que el aviso no baile.
 */
export function detectarSolapamiento(
  notasFondoDeseo: string[],
  coleccion: PerfumeConFondo[],
  minimo: number = MINIMO_NOTAS_COMUNES,
): Solapamiento[] {
  if (notasFondoDeseo.length === 0) return [];

  return coleccion
    .map((perfume) => ({
      perfumeId: perfume.id,
      nombre: perfume.nombre,
      marca: perfume.marca,
      comunes: notasComunes(notasFondoDeseo, perfume.notasFondo),
    }))
    .filter((s) => s.comunes.length >= minimo)
    .sort((a, b) => b.comunes.length - a.comunes.length || a.nombre.localeCompare(b.nombre, 'es'));
}

/** "Se parece a Khamrah y Asad que ya tienes." */
export function explicarSolapamiento(solapamientos: Solapamiento[]): string {
  if (solapamientos.length === 0) return '';
  const nombres = solapamientos.map((s) => s.nombre);
  const listado =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
  return `Se parece a ${listado}, que ya ${nombres.length === 1 ? 'tienes' : 'tienes'}.`;
}
