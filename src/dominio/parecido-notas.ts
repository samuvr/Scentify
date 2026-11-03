/**
 * Parecido entre dos perfumes por su piramide entera, no solo por el fondo.
 *
 * El aviso de la wishlist (10.2) mira solo el fondo porque es lo que queda a
 * las cuatro horas. Pero la salida y el corazon tambien se notan, y mucho
 * tiempo: dos perfumes que abren igual y se desarrollan igual son el mismo
 * frasco aunque acaben distinto.
 *
 * Cada nota comun suma un punto si esta en el mismo nivel en los dos y medio
 * si esta en niveles distintos (la bergamota de salida en uno y de corazon en
 * otro se parece, pero menos). Se juzga con dos cosas:
 *
 * - Los puntos: con menos de tres no hay parecido que valga.
 * - La proporcion: los puntos sobre las notas del mas corto de los dos. Tres
 *   notas comunes en piramides de seis es medio perfume; en piramides de
 *   veinte, casi nada (bergamota, almizcle y ambar estan en todas partes).
 *
 * Es parecido con tres puntos o mas y al menos un 35 % de proporcion, o con
 * tres notas de fondo comunes como en 10.2, que sigue valiendo.
 */
import { normalizar } from './texto';

export type NivelNota = 'SALIDA' | 'CORAZON' | 'FONDO';

export interface NotaConNivel {
  nombre: string;
  nivel: NivelNota;
}

export interface PerfumeConNotas {
  id: string;
  nombre: string;
  marca: string;
  notas: NotaConNivel[];
}

export interface ParecidoPorNotas {
  perfumeId: string;
  nombre: string;
  marca: string;
  /**
   * Las notas comunes, con la grafia del perfume que ya tengo, agrupadas por
   * el nivel que tienen en el que se esta valorando.
   */
  comunes: Record<NivelNota, string[]>;
  puntos: number;
  /** Puntos sobre las notas del mas corto, de 0 a 1, con dos decimales. */
  proporcion: number;
}

export const MINIMO_PUNTOS = 3;
export const MINIMA_PROPORCION = 0.35;
/** La regla de 10.2: tres notas de fondo comunes ya es parecido. */
export const MINIMO_FONDO = 3;

/** Nota normalizada → nivel; si se repite, el primero (de salida a fondo). */
function porNombre(notas: NotaConNivel[]): Map<string, NivelNota> {
  const orden: NivelNota[] = ['SALIDA', 'CORAZON', 'FONDO'];
  const mapa = new Map<string, NivelNota>();
  for (const nivel of orden) {
    for (const n of notas) {
      if (n.nivel !== nivel) continue;
      const clave = normalizar(n.nombre);
      if (clave && !mapa.has(clave)) mapa.set(clave, nivel);
    }
  }
  return mapa;
}

/** Cuanto se parecen dos piramides, sin decidir aun si es parecido. */
export function compararPiramides(
  candidato: NotaConNivel[],
  perfume: PerfumeConNotas,
): ParecidoPorNotas {
  const delCandidato = porNombre(candidato);
  const delPerfume = porNombre(perfume.notas);
  const comunes: Record<NivelNota, string[]> = { SALIDA: [], CORAZON: [], FONDO: [] };
  const vistas = new Set<string>();
  let puntos = 0;

  for (const n of perfume.notas) {
    const clave = normalizar(n.nombre);
    if (!clave || vistas.has(clave)) continue;
    const nivelCandidato = delCandidato.get(clave);
    if (!nivelCandidato) continue;
    vistas.add(clave);
    comunes[nivelCandidato].push(n.nombre);
    puntos += delPerfume.get(clave) === nivelCandidato ? 1 : 0.5;
  }

  const corto = Math.min(delCandidato.size, delPerfume.size);
  return {
    perfumeId: perfume.id,
    nombre: perfume.nombre,
    marca: perfume.marca,
    comunes,
    puntos,
    proporcion: corto > 0 ? Math.round((100 * puntos) / corto) / 100 : 0,
  };
}

/** Notas de fondo comunes que estan de fondo en los dos (la regla de 10.2). */
function fondoEnLosDos(candidato: NotaConNivel[], perfume: PerfumeConNotas): number {
  const fondo = (notas: NotaConNivel[]) =>
    new Set(notas.filter((n) => n.nivel === 'FONDO').map((n) => normalizar(n.nombre)).filter(Boolean));
  const a = fondo(candidato);
  return [...fondo(perfume.notas)].filter((n) => a.has(n)).length;
}

export function esParecido(
  comparacion: ParecidoPorNotas,
  candidato: NotaConNivel[],
  perfume: PerfumeConNotas,
): boolean {
  if (fondoEnLosDos(candidato, perfume) >= MINIMO_FONDO) return true;
  return comparacion.puntos >= MINIMO_PUNTOS && comparacion.proporcion >= MINIMA_PROPORCION;
}

/** Los perfumes de la coleccion que se parecen, de mas a menos. */
export function parecidosPorNotas(
  candidato: NotaConNivel[],
  coleccion: PerfumeConNotas[],
): ParecidoPorNotas[] {
  if (candidato.length === 0) return [];
  return coleccion
    .map((p) => ({ p, c: compararPiramides(candidato, p) }))
    .filter(({ p, c }) => esParecido(c, candidato, p))
    .map(({ c }) => c)
    .sort(
      (a, b) =>
        b.proporcion - a.proporcion || b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, 'es'),
    );
}
