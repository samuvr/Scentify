/**
 * Exportacion de la coleccion para pegarsela a un asistente de IA.
 *
 * La copia completa de la seccion 9 es para restaurar: lleva ids, enums en
 * mayusculas y todo lo necesario para reconstruir la base de datos. Aqui es al
 * reves: solo lo que sirve para razonar sobre la coleccion, con etiquetas en
 * castellano legible, sin ids, y con una cabecera que explica cada campo para
 * que el modelo no tenga que adivinar que significa `momentos` o `contextos`.
 *
 * Funcion pura: la fecha y la ubicacion entran por parametro.
 */
import type { DuracionPercibida, Estacion, EstadoPerfume, Momento } from './tipos';

export interface UsoAgregado {
  vecesUsado: number;
  ultimoUso: string | null;
  valoracionMedia: number | null;
  spraysHabituales: number | null;
  duracionEsperada: DuracionPercibida | null;
}

/** Un frasco con todo lo que se exporta, ya agrupado por el servicio. */
export interface PerfumeExportable {
  nombre: string;
  marca: string;
  concentracion: string | null;
  anioLanzamiento: number | null;
  volumenMl: number | null;
  fechaCompra: string | null;
  estado: EstadoPerfume;
  archivado: boolean;
  valoracion: number | null;
  notasPersonales: string | null;
  notas: { salida: string[]; corazon: string[]; fondo: string[] };
  familias: string[];
  contextos: string[];
  estaciones: Estacion[];
  momentos: Momento[];
  uso: UsoAgregado | null;
}

export interface DeseoExportable {
  nombre: string;
  marca: string;
  prioridad: 'EN_EL_RADAR' | 'LO_QUIERO' | 'LO_NECESITO';
  precioObjetivo: string | null;
  notas: string | null;
}

export interface EntradaExportacionIa {
  perfumes: PerfumeExportable[];
  deseos: DeseoExportable[];
  /** Etiqueta de la ubicacion habitual, para que la IA sepa donde mirar el tiempo. */
  ubicacion: string | null;
  /** YYYY-MM-DD. */
  hoy: string;
}

const ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'primavera',
  VERANO: 'verano',
  OTONO: 'otoño',
  INVIERNO: 'invierno',
};

const MOMENTO: Record<Momento, string> = { DIA: 'día', NOCHE: 'noche' };

const DURACION: Record<DuracionPercibida, string> = {
  MENOS_2H: 'menos de 2 h',
  DE_2_4H: '2-4 h',
  DE_4_6H: '4-6 h',
  DE_6_8H: '6-8 h',
  MAS_8H: 'más de 8 h',
};

const PRIORIDAD: Record<DeseoExportable['prioridad'], string> = {
  EN_EL_RADAR: 'en el radar',
  LO_QUIERO: 'lo quiero',
  LO_NECESITO: 'lo necesito',
};

/**
 * Lo que la IA lee primero. Explica los campos y los limites del dato, para
 * que no confunda «contextos» con ocasiones exhaustivas ni invente notas.
 */
const ACERCA_DE = [
  'Exportación de una colección personal de perfumes hecha con la app Scentify.',
  '«coleccion» son los frascos que tengo ahora; «ya_no_tengo», los que tuve; «lista_de_deseos», los que me planteo comprar.',
  'Las notas (salida, corazón, fondo) y las familias olfativas vienen de la ficha del perfume, normalmente copiada de Fragrantica.',
  '«estaciones», «momentos» y «contextos» son MIS marcas: cuándo y dónde me parece apropiado ponérmelo, no la opinión general.',
  '«valoracion» es mi nota de 1 a 5 al perfume; «uso» resume el diario de lo que me he puesto (veces, último día, nota media del día, sprays y duración que noto).',
  '«resumen» cuenta cuántos frascos de la colección llevan cada nota y cada familia, para detectar huecos y repeticiones.',
].join(' ');

function conteo(listas: string[][]): Record<string, number> {
  const mapa = new Map<string, number>();
  for (const lista of listas) {
    // Una nota que sale en dos niveles del mismo perfume cuenta una vez.
    for (const valor of new Set(lista)) mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
  }
  // De mas a menos frecuente, y alfabetico en los empates, para que el
  // fichero sea estable entre dos exportaciones iguales.
  const ordenado = [...mapa].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  return Object.fromEntries(ordenado);
}

/** Quita las claves vacias: a la IA no le aporta un `null` ni una lista vacia. */
function compactar<T extends Record<string, unknown>>(objeto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(
      ([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  ) as Partial<T>;
}

function perfumeParaIa(p: PerfumeExportable) {
  const uso =
    p.uso && p.uso.vecesUsado > 0
      ? compactar({
          veces: p.uso.vecesUsado,
          ultimo_dia: p.uso.ultimoUso,
          valoracion_media_del_dia: p.uso.valoracionMedia,
          sprays_habituales: p.uso.spraysHabituales,
          duracion_habitual: p.uso.duracionEsperada ? DURACION[p.uso.duracionEsperada] : null,
        })
      : { veces: 0 };

  return compactar({
    nombre: p.nombre,
    marca: p.marca,
    concentracion: p.concentracion,
    anio: p.anioLanzamiento,
    ml: p.volumenMl,
    fecha_compra: p.fechaCompra,
    valoracion: p.valoracion,
    notas: compactar({ salida: p.notas.salida, corazon: p.notas.corazon, fondo: p.notas.fondo }),
    familias: p.familias,
    estaciones: p.estaciones.map((e) => ESTACION[e]),
    momentos: p.momentos.map((m) => MOMENTO[m]),
    contextos: p.contextos,
    uso,
    mis_notas: p.notasPersonales?.trim() || null,
  });
}

export function documentoParaIa(entrada: EntradaExportacionIa) {
  const visibles = entrada.perfumes.filter((p) => !p.archivado);
  const tengo = visibles.filter((p) => p.estado === 'LO_TENGO');
  const tuve = visibles.filter((p) => p.estado === 'LO_TUVE');

  const ya_no_tengo = tuve.map((p) =>
    compactar({
      nombre: p.nombre,
      marca: p.marca,
      concentracion: p.concentracion,
      valoracion: p.valoracion,
      mis_notas: p.notasPersonales?.trim() || null,
    }),
  );
  const lista_de_deseos = entrada.deseos.map((d) =>
    compactar({
      nombre: d.nombre,
      marca: d.marca,
      prioridad: PRIORIDAD[d.prioridad],
      precio_maximo: d.precioObjetivo,
      notas: d.notas?.trim() || null,
    }),
  );

  return {
    acerca_de: ACERCA_DE,
    generado_el: entrada.hoy,
    ...(entrada.ubicacion ? { ubicacion_habitual: entrada.ubicacion } : {}),
    resumen: {
      perfumes: tengo.length,
      notas: conteo(tengo.map((p) => [...p.notas.salida, ...p.notas.corazon, ...p.notas.fondo])),
      familias: conteo(tengo.map((p) => p.familias)),
    },
    coleccion: tengo.map(perfumeParaIa),
    ...(ya_no_tengo.length ? { ya_no_tengo } : {}),
    ...(lista_de_deseos.length ? { lista_de_deseos } : {}),
  };
}
