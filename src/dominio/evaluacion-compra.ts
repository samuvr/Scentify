/**
 * ¿Merece la pena comprarlo?
 *
 * Se marca un perfume que aun no tengo igual que en el alta (estaciones,
 * momentos y contextos) y se mira que pasaria con el reparto (10.1) si ya lo
 * tuviera. La pregunta no es si es bueno, sino si viene a llenar casillas que
 * tengo flojas o a ocupar las que ya van sobradas.
 *
 * El calculo:
 *
 * 1. Las casillas que cubre: las del reparto de los contextos marcados, en los
 *    momentos y estaciones marcados (en un contexto atemporal, la suya sola).
 *    Las de contextos sin frecuencia o sin uso no se juzgan.
 * 2. Cada casilla vale segun como esta HOY: vacia 1, escasa 0,75, bien 0,35 y
 *    holgada 0. Bien no es cero: un frasco mas ahi da variedad, pero no tapa
 *    nada.
 * 3. La nota es la media de esos valores, pesada como en el reparto: la raiz
 *    de los usos por semana del contexto por la parte de su momento. Llenar la
 *    oficina (cinco dias a la semana) cuenta mas que llenar la ocasion
 *    elegante.
 * 4. Con 0,6 o mas, merece la pena; con 0,3 o mas, aporta algo; por debajo,
 *    es prescindible.
 * 5. Si se parece a uno que ya tengo (por la piramide entera, salida,
 *    corazon y fondo, ver parecido-notas; o porque Fragrantica dice que
 *    recuerda a el), baja un escalon: puede caer en una casilla floja y aun
 *    asi ser casi el mismo frasco.
 *
 * Funcion pura: recibe la coleccion y los contextos ya cargados.
 */
import type { PerfumeCandidato } from './recomendacion';
import type { Estacion, Momento } from './tipos';
import { fraccionDelMomento } from './contextos';
import {
  repartoPorContexto,
  type CasillaReparto,
  type ContextoReparto,
  type NivelReparto,
} from './reparto';
import type { NivelNota, ParecidoPorNotas } from './parecido-notas';
import { normalizar } from './texto';

export type Veredicto = 'merece' | 'aporta' | 'prescindible' | 'sin-datos';

export interface CandidatoCompra {
  nombre: string;
  marca: string;
  contextos: string[];
  momentos: Momento[];
  estaciones: Estacion[];
}

export interface PerfumeParecido {
  perfumeId: string;
  nombre: string;
  marca: string;
  /** Notas comunes por nivel; vacias si solo lo dice Fragrantica. */
  comunes: Record<NivelNota, string[]>;
  /** Puntos sobre las notas del mas corto, de 0 a 1; null si solo lo dice Fragrantica. */
  proporcion: number | null;
  /** Fragrantica lo pone en «Esta fragancia me recuerda a». */
  segunFragrantica: boolean;
}

export interface Competidor {
  id: string;
  nombre: string;
  marca: string;
}

export interface CasillaEvaluada {
  contextoId: string;
  momento: Momento | null;
  estacion: Estacion | null;
  /** Como esta hoy. */
  antes: Pick<CasillaReparto, 'cuantos' | 'cobertura' | 'nivel' | 'esperado'>;
  /** Como quedaria con el perfume. */
  despues: Pick<CasillaReparto, 'cuantos' | 'cobertura' | 'nivel'>;
  /** Lo que vale llenarla, de 0 a 1. */
  valor: number;
  /** Peso de la casilla en la nota. */
  peso: number;
  /** Los que ya la ocupan, por nombre. */
  competidores: Competidor[];
}

export interface EvaluacionCompra {
  veredicto: Veredicto;
  /** Lo que saldria sin tener en cuenta el parecido. */
  veredictoPorCasillas: Veredicto;
  /** De 0 a 1, con dos decimales. null si no hay nada que juzgar. */
  nota: number | null;
  /** Las casillas que cubre y se juzgan, de la que mas aporta a la que menos. */
  casillas: CasillaEvaluada[];
  /**
   * Contextos marcados que no se juzgan: sin frecuencia, sin uso, o sin
   * ninguna casilla en los momentos marcados (la oficina con un perfume de
   * noche).
   */
  contextosSinJuzgar: string[];
  parecidos: PerfumeParecido[];
}

const VALOR: Record<NivelReparto, number> = {
  vacia: 1,
  escasa: 0.75,
  normal: 0.35,
  holgada: 0,
  'sin-uso': 0,
  'sin-frecuencia': 0,
};

export const UMBRAL_MERECE = 0.6;
export const UMBRAL_APORTA = 0.3;

const juzgable = (n: NivelReparto) => n !== 'sin-uso' && n !== 'sin-frecuencia';

export function veredictoDeNota(nota: number | null): Veredicto {
  if (nota === null) return 'sin-datos';
  if (nota >= UMBRAL_MERECE) return 'merece';
  if (nota >= UMBRAL_APORTA) return 'aporta';
  return 'prescindible';
}

/** Un escalon menos por parecerse a algo que ya tengo. */
export function bajarUnEscalon(v: Veredicto): Veredicto {
  if (v === 'merece') return 'aporta';
  if (v === 'aporta') return 'prescindible';
  return v;
}

const ID_CANDIDATO = '__candidato__';

const claveDe = (c: Pick<CasillaReparto, 'contextoId' | 'momento' | 'estacion'>) =>
  `${c.contextoId}|${c.momento ?? '-'}|${c.estacion ?? '-'}`;

/** La casilla la cubre un perfume con esas marcas. */
function cubre(
  p: Pick<CandidatoCompra, 'contextos' | 'momentos' | 'estaciones'>,
  c: Pick<CasillaReparto, 'contextoId' | 'momento' | 'estacion'>,
): boolean {
  if (!p.contextos.includes(c.contextoId)) return false;
  if (c.momento === null || c.estacion === null) return true;
  return p.momentos.includes(c.momento) && p.estaciones.includes(c.estacion);
}

/**
 * Los perfumes de la coleccion que se parecen al candidato: los de notas
 * comunes (ya calculados con parecidosPorNotas) y los que Fragrantica pone en
 * «me recuerda a», buscados por nombre (y marca, si la trae).
 */
export function parecidosEnLaColeccion(
  porNotas: ParecidoPorNotas[],
  recuerdaA: { nombre: string; marca: string | null }[],
  coleccion: Pick<PerfumeCandidato, 'id' | 'nombre' | 'marca' | 'estado' | 'archivado'>[],
): PerfumeParecido[] {
  const porId = new Map<string, PerfumeParecido>();
  for (const s of porNotas) {
    porId.set(s.perfumeId, {
      perfumeId: s.perfumeId,
      nombre: s.nombre,
      marca: s.marca,
      comunes: s.comunes,
      proporcion: s.proporcion,
      segunFragrantica: false,
    });
  }
  const mios = coleccion.filter((p) => p.estado === 'LO_TENGO' && !p.archivado);
  for (const r of recuerdaA) {
    const nombre = normalizar(r.nombre);
    const marca = r.marca ? normalizar(r.marca) : null;
    if (!nombre) continue;
    for (const p of mios) {
      if (normalizar(p.nombre) !== nombre) continue;
      if (marca && normalizar(p.marca) !== marca) continue;
      const previo = porId.get(p.id);
      if (previo) previo.segunFragrantica = true;
      else {
        porId.set(p.id, {
          perfumeId: p.id,
          nombre: p.nombre,
          marca: p.marca,
          comunes: { SALIDA: [], CORAZON: [], FONDO: [] },
          proporcion: null,
          segunFragrantica: true,
        });
      }
    }
  }
  return [...porId.values()].sort(
    (a, b) =>
      Number(b.segunFragrantica) - Number(a.segunFragrantica) ||
      (b.proporcion ?? 0) - (a.proporcion ?? 0) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
}

export function evaluarCompra({
  candidato,
  coleccion,
  contextos,
  parecidos = [],
}: {
  candidato: CandidatoCompra;
  coleccion: PerfumeCandidato[];
  contextos: ContextoReparto[];
  parecidos?: PerfumeParecido[];
}): EvaluacionCompra {
  const antes = repartoPorContexto(coleccion, contextos);
  const virtual: PerfumeCandidato = {
    id: ID_CANDIDATO,
    nombre: candidato.nombre,
    marca: candidato.marca,
    estado: 'LO_TENGO',
    archivado: false,
    momentos: candidato.momentos,
    contextos: candidato.contextos,
    estaciones: candidato.estaciones,
    ultimoUso: null,
    vecesUsado: 0,
  };
  const despues = repartoPorContexto([...coleccion, virtual], contextos);
  const despuesPorClave = new Map(despues.casillas.map((c) => [claveDe(c), c]));

  const utiles = coleccion.filter((p) => p.estado === 'LO_TENGO' && !p.archivado);
  const contextoPorId = new Map(contextos.map((c) => [c.id, c]));

  const cubiertas = antes.casillas.filter((c) => cubre(candidato, c));

  const casillas: CasillaEvaluada[] = cubiertas
    .filter((c) => juzgable(c.nivel))
    .map((c) => {
      const ctx = contextoPorId.get(c.contextoId)!;
      const fraccion = c.momento === null ? 1 : fraccionDelMomento(ctx, c.momento);
      const peso = Math.sqrt(Math.max(0, ctx.usosSemana ?? 0)) * fraccion;
      const luego = despuesPorClave.get(claveDe(c));
      return {
        contextoId: c.contextoId,
        momento: c.momento,
        estacion: c.estacion,
        antes: {
          cuantos: c.cuantos,
          cobertura: c.cobertura,
          nivel: c.nivel,
          esperado: c.esperado,
        },
        despues: {
          cuantos: luego?.cuantos ?? c.cuantos + 1,
          cobertura: luego?.cobertura ?? null,
          nivel: luego?.nivel ?? c.nivel,
        },
        valor: VALOR[c.nivel],
        peso,
        competidores: utiles
          .filter((p) => cubre(p, c))
          .map((p) => ({ id: p.id, nombre: p.nombre, marca: p.marca }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      };
    })
    .filter((c) => c.peso > 0)
    .sort(
      (a, b) =>
        b.valor - a.valor ||
        (a.antes.cobertura ?? 0) - (b.antes.cobertura ?? 0) ||
        b.peso - a.peso,
    );

  const juzgados = new Set(casillas.map((c) => c.contextoId));
  const contextosSinJuzgar = candidato.contextos.filter(
    (id) => contextoPorId.has(id) && !juzgados.has(id),
  );

  const pesoTotal = casillas.reduce((s, c) => s + c.peso, 0);
  const nota =
    pesoTotal > 0
      ? Math.round((100 * casillas.reduce((s, c) => s + c.valor * c.peso, 0)) / pesoTotal) / 100
      : null;

  const veredictoPorCasillas = veredictoDeNota(nota);
  const veredicto =
    parecidos.length > 0 ? bajarUnEscalon(veredictoPorCasillas) : veredictoPorCasillas;

  return { veredicto, veredictoPorCasillas, nota, casillas, contextosSinJuzgar, parecidos };
}

/** Cuantas casillas de cada nivel cubre, para el resumen. */
export function recuentoPorNivel(casillas: CasillaEvaluada[]): Record<NivelReparto, number> {
  const recuento: Record<NivelReparto, number> = {
    vacia: 0,
    escasa: 0,
    normal: 0,
    holgada: 0,
    'sin-uso': 0,
    'sin-frecuencia': 0,
  };
  for (const c of casillas) recuento[c.antes.nivel] += 1;
  return recuento;
}
