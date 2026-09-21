/**
 * Seccion 9 — CSV de colección e histórico.
 *
 * Se escribe el parser a mano en vez de tirar de libreria porque el formato que
 * hay que soportar es el que exporta esta misma app mas lo que salga de un
 * Excel o un Google Sheets: comillas, comas dentro del campo, saltos de linea
 * dentro del campo y CRLF. Nada mas.
 */

export type FilaCsv = string[];

/* ------------------------------------------------------------- escritura */

/** Entrecomilla solo cuando hace falta, y duplica las comillas interiores. */
function escaparCampo(valor: string): string {
  return /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function serializarCsv(filas: FilaCsv[]): string {
  return filas.map((fila) => fila.map(escaparCampo).join(',')).join('\r\n');
}

/* --------------------------------------------------------------- lectura */

/**
 * Parser de CSV en una pasada. Reconoce campos entrecomillados con comas y
 * saltos dentro, comillas escapadas duplicandolas, y acepta LF y CRLF.
 */
export function parsearCsv(texto: string): FilaCsv[] {
  const filas: FilaCsv[] = [];
  let fila: FilaCsv = [];
  let campo = '';
  let entreComillas = false;
  let hayContenido = false;

  // El BOM de Excel, si viene, no es parte del primer encabezado.
  const fuente = texto.replace(/^﻿/, '');

  for (let i = 0; i < fuente.length; i += 1) {
    const c = fuente[i];

    if (entreComillas) {
      if (c === '"') {
        if (fuente[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      entreComillas = true;
      hayContenido = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
      hayContenido = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && fuente[i + 1] === '\n') i += 1;
      fila.push(campo);
      // Una linea en blanco entre registros no es una fila vacia.
      if (hayContenido || fila.some((v) => v !== '')) filas.push(fila);
      fila = [];
      campo = '';
      hayContenido = false;
    } else {
      campo += c;
      hayContenido = true;
    }
  }

  if (hayContenido || campo !== '' || fila.length > 0) {
    fila.push(campo);
    if (fila.some((v) => v !== '')) filas.push(fila);
  }

  return filas;
}

/* ---------------------------------------------- mapeo de la coleccion */

export const CABECERAS_COLECCION = [
  'nombre',
  'marca',
  'concentracion',
  'anio_lanzamiento',
  'volumen_ml',
  'fecha_compra',
  'estado',
  'valoracion',
  'notas_salida',
  'notas_corazon',
  'notas_fondo',
  'familias',
  'contextos',
  'estaciones',
  'momentos',
  'fragrantica_url',
  'notas_personales',
] as const;

export type CabeceraColeccion = (typeof CABECERAS_COLECCION)[number];

/** Los campos multivalor se separan por punto y coma. */
export const SEPARADOR_LISTA = ';';

export interface FilaColeccion {
  nombre: string;
  marca: string;
  concentracion: string | null;
  anioLanzamiento: number | null;
  volumenMl: number | null;
  fechaCompra: string | null;
  estado: 'LO_TENGO' | 'LO_TUVE';
  valoracion: number | null;
  notasSalida: string[];
  notasCorazon: string[];
  notasFondo: string[];
  familias: string[];
  contextos: string[];
  estaciones: string[];
  momentos: string[];
  fragranticaUrl: string | null;
  notasPersonales: string | null;
}

export interface ErrorFila {
  /** Numero de linea en el fichero, contando la cabecera como la 1. */
  linea: number;
  motivo: string;
}

export interface ResultadoImportacion {
  filas: FilaColeccion[];
  errores: ErrorFila[];
  /** Cabeceras del fichero que no se reconocen; se ignoran sin romper nada. */
  cabecerasDesconocidas: string[];
}

const CONCENTRACIONES = ['EDC', 'EDT', 'EDP', 'EXTRAIT', 'PARFUM', 'ACEITE', 'OTRO'];
const ESTACIONES_VALIDAS = ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'];
const MOMENTOS_VALIDOS = ['DIA', 'NOCHE'];

const lista = (valor: string): string[] =>
  valor
    .split(SEPARADOR_LISTA)
    .map((v) => v.trim())
    .filter(Boolean);

const entero = (valor: string): number | null => {
  const limpio = valor.trim();
  if (limpio === '') return null;
  const numero = Number(limpio);
  return Number.isInteger(numero) ? numero : null;
};

/**
 * Valida la estructura del CSV. No resuelve nombres de contexto ni de familia
 * contra la base de datos: eso lo hace el servicio, que es quien sabe cuales
 * existen.
 */
export function analizarCsvColeccion(texto: string): ResultadoImportacion {
  const filas = parsearCsv(texto);
  const errores: ErrorFila[] = [];

  const cabecera = filas[0];
  if (!cabecera) {
    return { filas: [], errores: [{ linea: 1, motivo: 'El fichero está vacío.' }], cabecerasDesconocidas: [] };
  }

  const claves = cabecera.map((c) => c.trim().toLowerCase());
  const indice = (clave: CabeceraColeccion) => claves.indexOf(clave);
  const cabecerasDesconocidas = claves.filter(
    (c) => c !== '' && !(CABECERAS_COLECCION as readonly string[]).includes(c),
  );

  if (indice('nombre') < 0 || indice('marca') < 0) {
    return {
      filas: [],
      errores: [{ linea: 1, motivo: 'Faltan las columnas obligatorias «nombre» y «marca».' }],
      cabecerasDesconocidas,
    };
  }

  const validas: FilaColeccion[] = [];

  filas.slice(1).forEach((fila, i) => {
    const linea = i + 2;
    const campo = (clave: CabeceraColeccion): string => {
      const pos = indice(clave);
      return pos >= 0 ? (fila[pos] ?? '').trim() : '';
    };

    const nombre = campo('nombre');
    const marca = campo('marca');
    if (!nombre || !marca) {
      errores.push({ linea, motivo: 'Nombre y marca son obligatorios.' });
      return;
    }

    const concentracion = campo('concentracion').toUpperCase();
    if (concentracion && !CONCENTRACIONES.includes(concentracion)) {
      errores.push({ linea, motivo: `Concentración desconocida: «${concentracion}».` });
      return;
    }

    const estadoBruto = campo('estado').toUpperCase() || 'LO_TENGO';
    if (estadoBruto !== 'LO_TENGO' && estadoBruto !== 'LO_TUVE') {
      errores.push({ linea, motivo: `Estado desconocido: «${estadoBruto}».` });
      return;
    }

    const valoracion = entero(campo('valoracion'));
    if (valoracion !== null && (valoracion < 1 || valoracion > 5)) {
      errores.push({ linea, motivo: 'La valoración va de 1 a 5.' });
      return;
    }

    const fechaCompra = campo('fecha_compra');
    if (fechaCompra && !/^\d{4}-\d{2}-\d{2}$/.test(fechaCompra)) {
      errores.push({ linea, motivo: 'La fecha de compra debe ser AAAA-MM-DD.' });
      return;
    }

    const estaciones = lista(campo('estaciones')).map((e) => e.toUpperCase());
    const desconocida = estaciones.find((e) => !ESTACIONES_VALIDAS.includes(e));
    if (desconocida) {
      errores.push({ linea, motivo: `Estación desconocida: «${desconocida}».` });
      return;
    }

    const momentos = lista(campo('momentos')).map((m) => m.toUpperCase());
    const momentoMalo = momentos.find((m) => !MOMENTOS_VALIDOS.includes(m));
    if (momentoMalo) {
      errores.push({ linea, motivo: `Momento desconocido: «${momentoMalo}».` });
      return;
    }

    validas.push({
      nombre,
      marca,
      concentracion: concentracion || null,
      anioLanzamiento: entero(campo('anio_lanzamiento')),
      volumenMl: entero(campo('volumen_ml')),
      fechaCompra: fechaCompra || null,
      estado: estadoBruto,
      valoracion,
      notasSalida: lista(campo('notas_salida')),
      notasCorazon: lista(campo('notas_corazon')),
      notasFondo: lista(campo('notas_fondo')),
      familias: lista(campo('familias')),
      contextos: lista(campo('contextos')),
      estaciones,
      momentos,
      fragranticaUrl: campo('fragrantica_url') || null,
      notasPersonales: campo('notas_personales') || null,
    });
  });

  return { filas: validas, errores, cabecerasDesconocidas };
}
