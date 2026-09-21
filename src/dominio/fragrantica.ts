/**
 * Seccion 5 — Lectura de una ficha de Fragrantica.
 *
 * Esto es un parser, no un scraper: no recorre el sitio, no sigue enlaces y no
 * se dispara solo. Recibe el HTML de UNA ficha que el usuario ha pedido, o el
 * texto que ha copiado del navegador cuando la peticion falla, y saca de ahi lo
 * que se enseña como apoyo visual al categorizar.
 *
 * Los votos NO se persisten (5.3): salen de aqui, se pintan junto a cada
 * casilla y se descartan al guardar. Ninguna logica de negocio depende de ellos.
 *
 * El parser es deliberadamente tolerante. El bloque se renderiza distinto
 * segun haya muchos votos o pocos, y en la ficha conviven el numero visible y
 * el `style="width:X%"` de la barra: se extraen los dos y se usa el que haya.
 */
import type { Estacion, Momento } from './tipos';

export interface VotoEje {
  /** Numero de votos, si la ficha lo enseña. */
  votos: number | null;
  /** Anchura de la barra en porcentaje, si esta en el `style`. */
  anchura: number | null;
  /** Normalizado sobre el total del eje, que es lo que se pinta. */
  pct: number;
}

export interface PiramideNotas {
  salida: string[];
  corazon: string[];
  fondo: string[];
}

export interface FichaFragrantica {
  estaciones: Record<Estacion, VotoEje> | null;
  momentos: Record<Momento, VotoEje> | null;
  notas: PiramideNotas;
  marca: string | null;
  anio: number | null;
  acordes: string[];
}

/** Etiquetas de cada eje, en ingles y en español. */
const ETIQUETAS_ESTACION: Record<Estacion, string[]> = {
  INVIERNO: ['winter', 'invierno'],
  PRIMAVERA: ['spring', 'primavera'],
  VERANO: ['summer', 'verano'],
  OTONO: ['fall', 'autumn', 'otoño', 'otono'],
};

const ETIQUETAS_MOMENTO: Record<Momento, string[]> = {
  DIA: ['day', 'daytime', 'día', 'dia'],
  NOCHE: ['night', 'nighttime', 'noche'],
};

const ETIQUETAS_NIVEL: Record<keyof PiramideNotas, string[]> = {
  salida: ['top notes', 'notas de salida', 'notas de cabeza'],
  corazon: ['middle notes', 'heart notes', 'notas de corazón', 'notas de corazon'],
  fondo: ['base notes', 'notas de fondo', 'notas de base'],
};

/** Donde termina la piramide: lo que Fragrantica pinta justo despues. */
const MARCADORES_FIN_PIRAMIDE = [
  'when to wear',
  'cuándo usarlo',
  'cuando usarlo',
  'main accords',
  'acordes principales',
  'longevity',
  'duración',
  'sillage',
  'estela',
  'reviews',
  'opiniones',
];

/** Ventana, en caracteres, en la que se busca el dato asociado a una etiqueta. */
const VENTANA = 700;

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Posiciones donde aparece una etiqueta como palabra suelta, no como parte de
 * otra ("day" no debe casar dentro de "Monday" ni de "everyday").
 */
function posicionesDe(fuente: string, etiqueta: string): number[] {
  const patron = new RegExp(`(^|[^\\p{L}])${escapar(etiqueta)}([^\\p{L}]|$)`, 'giu');
  const encontradas: number[] = [];
  for (const coincidencia of fuente.matchAll(patron)) {
    if (coincidencia.index !== undefined) encontradas.push(coincidencia.index);
  }
  return encontradas;
}

const pareceHtml = (fuente: string) => /<[a-z!/]/i.test(fuente);

/**
 * El numero visible de votos.
 *
 * En HTML solo se acepta un nodo de texto que sea exactamente un numero. El
 * barrido suelto se reserva al texto pegado: en una pagina real hay digitos por
 * todas partes (`class="cell small-9"`, `background: #cc9966`) y confundirlos
 * con votos es peor que no encontrar ninguno.
 */
function primerNumero(fragmento: string, esHtml: boolean): number | null {
  const enNodo = fragmento.match(/>\s*(\d+(?:[.,]\d+)?)\s*</);
  if (enNodo?.[1]) return Number(enNodo[1].replace(',', '.'));
  if (esHtml) return null;
  const suelto = fragmento.match(/(^|[^\d%.,])(\d+(?:[.,]\d+)?)(?![\d%.,])/);
  return suelto?.[2] ? Number(suelto[2].replace(',', '.')) : null;
}

/**
 * La anchura de la barra.
 *
 * La barra vive dentro de un contenedor que casi siempre lleva `width: 100%`,
 * asi que quedarse con la primera anchura daria 100 en todas las estaciones.
 * La barra de verdad es la que ademas pinta un `background`.
 */
function primeraAnchura(fragmento: string): number | null {
  const anchuraDe = (estilo: string) => estilo.match(/width:\s*([\d.]+)\s*%/i)?.[1];

  const estilos = [...fragmento.matchAll(/style\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1] ?? '');
  const barra = estilos.find((e) => anchuraDe(e) && /background/i.test(e));
  const cualquiera = barra ?? estilos.find((e) => anchuraDe(e));
  if (cualquiera) return Number(anchuraDe(cualquiera));

  const suelta = fragmento.match(/width:\s*([\d.]+)\s*%/i);
  return suelta?.[1] ? Number(suelta[1]) : null;
}

/**
 * Dato crudo de una etiqueta: se mira primero por delante (lo habitual: la
 * barra va detras del nombre) y luego por detras, porque hay maquetaciones
 * donde el nombre va a la derecha de la barra.
 */
function datoDe(
  fuente: string,
  etiquetas: string[],
  esHtml: boolean,
): { votos: number | null; anchura: number | null } {
  const sinAnchuras = (t: string) => t.replace(/width:\s*[\d.]+\s*%/gi, '');

  for (const etiqueta of etiquetas) {
    for (const posicion of posicionesDe(fuente, etiqueta)) {
      const despues = fuente.slice(posicion, posicion + VENTANA);
      const antes = fuente.slice(Math.max(0, posicion - VENTANA), posicion);
      const anchura = primeraAnchura(despues) ?? primeraAnchura(antes);
      const votos =
        primerNumero(sinAnchuras(despues), esHtml) ?? primerNumero(sinAnchuras(antes), esHtml);
      if (anchura !== null || votos !== null) return { votos, anchura };
    }
  }
  return { votos: null, anchura: null };
}

/** Normaliza un eje a porcentajes sobre su propio total (paso 4 de la 5.1). */
function normalizarEje<C extends string>(
  fuente: string,
  etiquetas: Record<C, string[]>,
  esHtml: boolean,
): Record<C, VotoEje> | null {
  const crudos = {} as Record<C, { votos: number | null; anchura: number | null }>;
  let hayAlgo = false;

  for (const clave of Object.keys(etiquetas) as C[]) {
    const dato = datoDe(fuente, etiquetas[clave], esHtml);
    crudos[clave] = dato;
    if (dato.votos !== null || dato.anchura !== null) hayAlgo = true;
  }
  if (!hayAlgo) return null;

  // Se prefiere el recuento de votos; si la ficha no lo enseña, la anchura.
  const hayVotos = (Object.values(crudos) as { votos: number | null }[]).some(
    (d) => d.votos !== null,
  );
  const valorDe = (dato: { votos: number | null; anchura: number | null }) =>
    (hayVotos ? dato.votos : dato.anchura) ?? 0;

  const total = (Object.values(crudos) as { votos: number | null; anchura: number | null }[]).reduce(
    (suma, dato) => suma + valorDe(dato),
    0,
  );

  const resultado = {} as Record<C, VotoEje>;
  for (const clave of Object.keys(etiquetas) as C[]) {
    const dato = crudos[clave];
    resultado[clave] = {
      votos: dato.votos,
      anchura: dato.anchura,
      pct: total > 0 ? Math.round((100 * valorDe(dato)) / total) : 0,
    };
  }
  return resultado;
}

/* --------------------------------------------------------- piramide de notas */

const RUIDO = new Set([
  'notes', 'note', 'notas', 'nota', 'and', 'y', 'perfume', 'fragrance', 'accords',
  'top', 'middle', 'heart', 'base', 'salida', 'corazon', 'corazón', 'fondo',
  'reviews', 'pyramid', 'piramide', 'pirámide',
]);

function limpiarTexto(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .split(/<[^>]*>/)
    .map((t) => t.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean);
}

function esNombreDeNota(texto: string): boolean {
  if (texto.length < 2 || texto.length > 40) return false;
  // El corte entre niveles puede partir una etiqueta por la mitad ("<h4").
  if (texto.includes('<') || texto.includes('>')) return false;
  if (/^[\d\s.,%|·-]+$/.test(texto)) return false;
  if (RUIDO.has(texto.toLowerCase())) return false;
  return /\p{L}/u.test(texto);
}

function extraerPiramide(fuente: string): PiramideNotas {
  const niveles = Object.keys(ETIQUETAS_NIVEL) as (keyof PiramideNotas)[];

  // Posicion donde empieza cada nivel; el nivel termina donde empieza el siguiente.
  const cortes = niveles
    .map((nivel) => {
      const posiciones = ETIQUETAS_NIVEL[nivel]
        .flatMap((etiqueta) => posicionesDe(fuente, etiqueta))
        .sort((a, b) => a - b);
      return { nivel, inicio: posiciones[0] ?? -1 };
    })
    .filter((c) => c.inicio >= 0)
    .sort((a, b) => a.inicio - b.inicio);

  const piramide: PiramideNotas = { salida: [], corazon: [], fondo: [] };

  cortes.forEach((corte, i) => {
    // El ultimo nivel no tiene un nivel siguiente que lo corte, y sin frontera
    // se tragaria el bloque de votos que va justo debajo en la ficha.
    const siguienteNivel = cortes[i + 1]?.inicio;
    const siguienteBloque = MARCADORES_FIN_PIRAMIDE.flatMap((marcador) =>
      posicionesDe(fuente, marcador).filter((pos) => pos > corte.inicio),
    ).sort((a, b) => a - b)[0];

    const fin = Math.min(
      siguienteNivel ?? Number.POSITIVE_INFINITY,
      siguienteBloque ?? Number.POSITIVE_INFINITY,
      corte.inicio + 3000,
      fuente.length,
    );
    const trozo = fuente.slice(corte.inicio, fin);
    // Se salta la propia cabecera antes de leer los nombres.
    const nombres = limpiarTexto(trozo).slice(1).filter(esNombreDeNota);
    piramide[corte.nivel] = [...new Set(nombres)];
  });

  return piramide;
}

/* -------------------------------------------------------- marca, año, acordes */

function extraerMarca(html: string): string | null {
  const itemprop = html.match(/itemprop=["']brand["'][^>]*>\s*(?:<[^>]*>\s*)*([^<]{2,60})/i);
  if (itemprop?.[1]) return itemprop[1].trim();
  const titulo = html.match(/<title>\s*([^<]*?)\s+(?:by|de)\s+([^<|]{2,60})/i);
  return titulo?.[2]?.trim() ?? null;
}

function extraerAnio(fuente: string): number | null {
  const lanzamiento = fuente.match(
    /(?:launched in|was launched in|lanzado en|del año)\s*(\d{4})/i,
  );
  const anio = lanzamiento?.[1] ?? fuente.match(/\b(19\d{2}|20[0-4]\d)\b/)?.[1];
  if (!anio) return null;
  const numero = Number(anio);
  return numero >= 1700 && numero <= new Date().getFullYear() + 1 ? numero : null;
}

function extraerAcordes(html: string): string[] {
  const acordes = [...html.matchAll(/class=["'][^"']*accord-bar[^"']*["'][^>]*>([^<]{2,40})</gi)]
    .map((c) => c[1]?.trim())
    .filter((a): a is string => Boolean(a));
  return [...new Set(acordes)];
}

/* ------------------------------------------------------------------ entrada */

/**
 * Lee una ficha completa. Sirve igual para el HTML descargado por el servidor
 * y para el texto que el usuario pega cuando la peticion falla: el segundo
 * fallback de la 5.2 usa las mismas reglas.
 */
export function leerFichaFragrantica(fuente: string): FichaFragrantica {
  const esHtml = pareceHtml(fuente);
  return {
    estaciones: normalizarEje(fuente, ETIQUETAS_ESTACION, esHtml),
    momentos: normalizarEje(fuente, ETIQUETAS_MOMENTO, esHtml),
    notas: extraerPiramide(fuente),
    marca: extraerMarca(fuente),
    anio: extraerAnio(fuente),
    acordes: extraerAcordes(fuente),
  };
}

/** Solo se aceptan URLs de ficha de Fragrantica; nada de recorrer el sitio. */
export function esUrlDeFichaValida(url: string): boolean {
  try {
    const analizada = new URL(url);
    // El dominio registrable tiene que ser fragrantica.<tld>, no basta con que
    // "fragrantica" aparezca: fragrantica.com.loquesea.example no vale.
    const etiquetasDominio = analizada.hostname.toLowerCase().split('.');
    const registrable = etiquetasDominio.at(-2);

    return (
      analizada.protocol === 'https:' &&
      etiquetasDominio.length >= 2 &&
      registrable === 'fragrantica' &&
      /\/perfume\//i.test(analizada.pathname)
    );
  } catch {
    return false;
  }
}
