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

/**
 * Rotulos de la piramide. La ficha en español titula los niveles "Notas de
 * Salida", "Corazón" y "Base" a secas; la inglesa, "Top/Middle/Base Notes".
 * Los mas largos van primero para que "Notas de Corazón" gane a "Corazón".
 */
const ETIQUETAS_NIVEL: Record<keyof PiramideNotas, string[]> = {
  salida: ['notas de salida', 'notas de cabeza', 'top notes', 'salida'],
  corazon: [
    'notas de corazón',
    'notas de corazon',
    'middle notes',
    'heart notes',
    'corazón',
    'corazon',
  ],
  fondo: ['notas de fondo', 'notas de base', 'base notes', 'fondo', 'base'],
};

/**
 * El bloque de votos de estacion y momento.
 *
 * Buscar las etiquetas por toda la fuente es peligroso en el texto pegado: una
 * ficha real traia el titular "9 PM NIGHT OUT Afnan" entre las noticias del
 * pie, y de ahi salia "night" con un 9 al lado, que ganaba a los 3.300 votos
 * reales de noche y dejaba el eje en 100 % dia. Acotar al bloque es lo mismo
 * que ya se hace con la piramide y su contenedor.
 */
const INICIO_VOTOS = ['cuándo usarlo', 'cuando usarlo', 'when to wear'];

/** Lo que Fragrantica pinta justo despues del bloque de votos. */
const FIN_VOTOS = [
  'calificación',
  'calificacion',
  'rating',
  'reseñas',
  'resenas',
  'reviews',
  'composición de la fragancia',
  'composicion de la fragancia',
  'pirámide del perfume',
  'piramide del perfume',
  'fragrance pyramid',
  'votar por ingredientes',
  'vote for ingredients',
];

/** La piramide estructurada vive en este contenedor. */
const ANCLA_PIRAMIDE = 'id="pyramid"';

/**
 * Donde termina la piramide: lo que Fragrantica pinta justo despues. Los dos
 * primeros son los de la ficha actual; el resto cubren maquetaciones antiguas
 * y el texto pegado a mano, donde no hay contenedor que acote nada.
 */
const FIN_PIRAMIDE = [
  'votar por ingredientes',
  'vote for ingredients',
  'califica solamente',
  'rate only',
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

/**
 * Rotulos de las secciones vecinas. Sirven de tope: cuando aparece uno, el
 * bloque que se estaba leyendo ha terminado.
 */
const ROTULOS_SECCION = [
  // El enlace que Fragrantica pone justo debajo de los acordes.
  'buscar por acordes',
  'search by accords',
  'cuándo usarlo',
  'cuando usarlo',
  'when to wear',
  'pirámide del perfume',
  'piramide del perfume',
  'fragrance pyramid',
  'composición de la fragancia',
  'composicion de la fragancia',
  'votar por ingredientes',
  'vote for ingredients',
  'longevidad',
  'longevity',
  'estela',
  'sillage',
];

/** Rotulos del propio bloque que no son notas. */
const RUIDO_PIRAMIDE = [
  'composición de la fragancia',
  'composicion de la fragancia',
  'pirámide del perfume',
  'piramide del perfume',
  'fragrance pyramid',
  'mostrar votos',
  'ocultar votos',
  'mostrar etiquetas',
  'ocultar etiquetas',
  'show votes',
  'hide votes',
];

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
/**
 * Convierte el recuento tal y como lo escribe la ficha.
 *
 * Fragrantica abrevia: "2.8k" son 2800 y "140K" son 140000. Tambien aparecen
 * exactos con separador de millar ("140,437"). Un numero sin sufijo y con coma
 * seguida de exactamente tres digitos es un millar; con una o dos cifras
 * detras, un decimal.
 */
function aNumero(texto: string, sufijo: string | undefined): number | null {
  const esMillar = /^\d{1,3}(,\d{3})+$/.test(texto);
  const limpio = esMillar ? texto.replace(/,/g, '') : texto.replace(',', '.');
  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return null;

  const factor = sufijo?.toLowerCase() === 'k' ? 1000 : sufijo?.toLowerCase() === 'm' ? 1e6 : 1;
  return Math.round(valor * factor);
}

const NUMERO = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:[.,]\d+)?)\s*([kKmM])?`;

/**
 * Posiciones donde la etiqueta aparece como NODO DE TEXTO completo.
 *
 * Es lo que hace falta para los rotulos: "base" suelto casa dentro de clases
 * como `text-base`, y eso cortaba la seccion de corazon antes de tiempo.
 */
function posicionesDeNodo(fuente: string, etiqueta: string): number[] {
  const patron = new RegExp(`>(\\s*)${escapar(etiqueta)}\\s*<`, 'giu');
  const encontradas: number[] = [];
  for (const coincidencia of fuente.matchAll(patron)) {
    if (coincidencia.index === undefined) continue;
    // Se apunta al inicio de la etiqueta, no al '>' que la precede.
    encontradas.push(coincidencia.index + 1 + (coincidencia[1]?.length ?? 0));
  }
  return encontradas;
}

/**
 * Posiciones de un rotulo. En HTML se prefiere el nodo de texto exacto, que es
 * como se maquetan de verdad; si no aparece asi, se cae a la busqueda suelta
 * para no perder maquetaciones raras ni el texto pegado.
 */
function posicionesDeRotulo(fuente: string, etiqueta: string, esHtml: boolean): number[] {
  if (!esHtml) return posicionesDe(fuente, etiqueta);
  const comoNodo = posicionesDeNodo(fuente, etiqueta);
  return comoNodo.length > 0 ? comoNodo : posicionesDe(fuente, etiqueta);
}

function primerNumero(fragmento: string, esHtml: boolean): number | null {
  const enNodo = fragmento.match(new RegExp(`>\\s*${NUMERO}\\s*<`));
  if (enNodo?.[1]) return aNumero(enNodo[1], enNodo[2]);
  if (esHtml) return null;
  const suelto = fragmento.match(new RegExp(`(^|[^\\d%.,])${NUMERO}(?![\\d%.,])`));
  return suelto?.[2] ? aNumero(suelto[2], suelto[3]) : null;
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
    for (const posicion of posicionesDeRotulo(fuente, etiqueta, esHtml)) {
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

/**
 * Recorta la fuente al bloque de votos. Si no se encuentra el rotulo de
 * apertura se devuelve la fuente entera, que es el comportamiento de siempre.
 */
function bloqueDeVotos(fuente: string, esHtml: boolean): string {
  const inicio = INICIO_VOTOS.flatMap((rotulo) =>
    posicionesDeRotulo(fuente, rotulo, esHtml),
  ).sort((a, b) => a - b)[0];
  if (inicio === undefined) return fuente;

  const resto = fuente.slice(inicio);
  const fin = FIN_VOTOS.flatMap((rotulo) => posicionesDeRotulo(resto, rotulo, esHtml))
    .filter((posicion) => posicion > 0)
    .sort((a, b) => a - b)[0];
  return fin === undefined ? resto : resto.slice(0, fin);
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

/**
 * Trocea un fragmento en textos candidatos. En HTML los nodos de texto ya
 * separan cada nota; en texto pegado hay que partir por lineas y comas, porque
 * ahi no hay etiquetas que lo hagan.
 */
function trocearTexto(fragmento: string, esHtml: boolean): string[] {
  if (esHtml) return limpiarTexto(fragmento).slice(1);
  return fragmento
    .split(/[\n;,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(1);
}

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

/**
 * Region donde buscar la piramide.
 *
 * Importa acotarla: el rotulo "Notas de Salida" aparece tambien en el
 * `<meta description>` y en la prosa del resumen, mucho antes que la piramide
 * de verdad, y cortar desde ahi se traga media pagina (el menu de idiomas
 * incluido, que fue justo lo que pasaba).
 */
function regionPiramide(fuente: string): { inicio: number; fin: number } {
  const ancla = fuente.indexOf(ANCLA_PIRAMIDE);
  if (ancla < 0) return { inicio: 0, fin: fuente.length };

  const cierres = FIN_PIRAMIDE.flatMap((marcador) =>
    posicionesDe(fuente, marcador).filter((p) => p > ancla),
  ).sort((a, b) => a - b);

  return { inicio: ancla, fin: Math.min(cierres[0] ?? fuente.length, ancla + 20000) };
}

function esRuidoDePiramide(texto: string): boolean {
  const clave = texto.toLowerCase();
  return (
    RUIDO_PIRAMIDE.includes(clave) ||
    Object.values(ETIQUETAS_NIVEL).some((etiquetas) => etiquetas.includes(clave))
  );
}

const piramideVacia = (p: PiramideNotas) =>
  p.salida.length === 0 && p.corazon.length === 0 && p.fondo.length === 0;

/**
 * Dos caminos, y el orden depende de lo que se reciba.
 *
 * En HTML manda el bloque estructurado, que es como se renderiza la ficha.
 * En texto pegado manda la prosa del resumen: ahi no hay etiquetas que separen
 * una nota de la siguiente, y trocear por comas convierte "a, b y c" en dos
 * notas en vez de tres.
 */
function extraerPiramide(fuente: string): PiramideNotas {
  const esHtml = pareceHtml(fuente);
  const primero = esHtml ? piramideEstructurada(fuente) : piramideEnProsa(fuente);
  if (!piramideVacia(primero)) return primero;
  return esHtml ? piramideEnProsa(fuente) : piramideEstructurada(fuente);
}

function piramideEstructurada(fuente: string): PiramideNotas {
  const { inicio, fin } = regionPiramide(fuente);
  const region = fuente.slice(inicio, fin);
  const esHtml = pareceHtml(region);

  const niveles = Object.keys(ETIQUETAS_NIVEL) as (keyof PiramideNotas)[];
  const cortes = niveles
    .map((nivel) => {
      const posiciones = ETIQUETAS_NIVEL[nivel]
        .flatMap((etiqueta) => posicionesDeRotulo(region, etiqueta, esHtml))
        .sort((a, b) => a - b);
      return { nivel, inicio: posiciones[0] ?? -1 };
    })
    .filter((c) => c.inicio >= 0)
    .sort((a, b) => a.inicio - b.inicio);

  const piramide: PiramideNotas = { salida: [], corazon: [], fondo: [] };

  cortes.forEach((corte, i) => {
    // La frontera de verdad es el nivel siguiente. Para el ultimo nivel, que no
    // tiene ninguno detras, vale el primer bloque que venga despues; y como
    // ultimo recurso un tope holgado, porque entre una nota y la siguiente hay
    // imagenes y SVG que ocupan miles de caracteres.
    const siguienteBloque = FIN_PIRAMIDE.flatMap((marcador) =>
      posicionesDe(region, marcador).filter((pos) => pos > corte.inicio),
    ).sort((a, b) => a - b)[0];

    const final = Math.min(
      cortes[i + 1]?.inicio ?? Number.POSITIVE_INFINITY,
      siguienteBloque ?? Number.POSITIVE_INFINITY,
      corte.inicio + 20000,
      region.length,
    );
    const trozo = region.slice(corte.inicio, final);
    const nombres = trocearTexto(trozo, esHtml).filter(
      (t) => esNombreDeNota(t) && !esRuidoDePiramide(t),
    );
    piramide[corte.nivel] = [...new Set(nombres)];
  });

  return piramide;
}

/**
 * Segundo camino: la frase del resumen.
 *
 *   "Las Notas de Salida son bergamota, pimienta rosa y jazmín; las Notas de
 *    Corazón son lavanda...; las Notas de Fondo son ámbar, cedro y ládano."
 *
 * Es lo que hay cuando el usuario pega texto en vez de HTML (fallback de 5.2).
 */
function piramideEnProsa(fuente: string): PiramideNotas {
  const texto = pareceHtml(fuente) ? limpiarTexto(fuente).join(' ') : fuente;
  const piramide: PiramideNotas = { salida: [], corazon: [], fondo: [] };

  const patrones: Record<keyof PiramideNotas, RegExp> = {
    salida: /notas? de (?:salida|cabeza)\s+(?:son|es)\s+([^;.]+)/i,
    corazon: /notas? de coraz[oó]n\s+(?:son|es)\s+([^;.]+)/i,
    fondo: /notas? de (?:fondo|base)\s+(?:son|es)\s+([^;.]+)/i,
  };

  for (const [nivel, patron] of Object.entries(patrones) as [keyof PiramideNotas, RegExp][]) {
    const encontrado = texto.match(patron)?.[1];
    if (!encontrado) continue;
    piramide[nivel] = encontrado
      // "a, b y c" -> tres notas. El parentesis de "cempasúchil (tagete,
      // clavelón)" se respeta porque no se parte dentro de el.
      .split(/,(?![^(]*\))|\s+y\s+(?![^(]*\))/)
      .map((t) => t.trim())
      .filter(esNombreDeNota);
  }

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
  // La ficha española dice "se lanzó en 2022"; la inglesa, "was launched in".
  const lanzamiento = fuente.match(
    /(?:launched in|was launched in|se lanz[oó] en|lanzado en|del año)\s*(\d{4})/i,
  );
  const anio = lanzamiento?.[1] ?? fuente.match(/\b(19\d{2}|20[0-4]\d)\b/)?.[1];
  if (!anio) return null;
  const numero = Number(anio);
  return numero >= 1700 && numero <= new Date().getFullYear() + 1 ? numero : null;
}

/**
 * Acordes principales.
 *
 * Van bajo un rotulo "acordes principales" y despues, cada uno en su propio
 * nodo de texto junto a la barra de color. Se cortan al primer texto que ya no
 * parece un acorde para no arrastrar lo que venga debajo.
 */
function extraerAcordes(fuente: string): string[] {
  const rotulos = ['acordes principales', 'main accords'];
  const inicio = rotulos
    .flatMap((rotulo) => posicionesDeRotulo(fuente, rotulo, pareceHtml(fuente)))
    .sort((a, b) => a - b)[0];
  if (inicio === undefined) return [];

  const trozo = fuente.slice(inicio, inicio + 4000);
  const candidatos = trocearTexto(trozo, pareceHtml(trozo));

  const acordes: string[] = [];
  for (const texto of candidatos) {
    const clave = texto.toLowerCase();
    if (rotulos.includes(clave)) continue;
    // El rotulo de la seccion siguiente cierra la lista.
    if (ROTULOS_SECCION.includes(clave)) break;
    // Un acorde es una o dos palabras; en cuanto aparece una frase, se acabo.
    if (!esNombreDeNota(texto) || texto.split(/\s+/).length > 3) break;
    acordes.push(texto);
    if (acordes.length >= 12) break;
  }
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
  const votos = bloqueDeVotos(fuente, esHtml);
  /**
   * Si el recorte no da nada —una maquetacion sin el rotulo esperado, o un
   * pegado que empieza ya dentro del bloque— se vuelve a intentar con la
   * fuente entera, que es como se comportaba antes.
   */
  const respaldo = <C extends string>(etiquetas: Record<C, string[]>) =>
    votos === fuente ? null : normalizarEje(fuente, etiquetas, esHtml);

  return {
    estaciones: normalizarEje(votos, ETIQUETAS_ESTACION, esHtml) ?? respaldo(ETIQUETAS_ESTACION),
    momentos: normalizarEje(votos, ETIQUETAS_MOMENTO, esHtml) ?? respaldo(ETIQUETAS_MOMENTO),
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
