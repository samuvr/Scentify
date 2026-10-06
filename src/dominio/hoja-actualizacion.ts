/**
 * Seccion 9 — Actualizacion masiva desde Excel.
 *
 * Se descarga una hoja con un frasco por fila, se corrigen la concentracion,
 * el volumen y la valoracion en Excel o Google Sheets, y se vuelve a subir.
 * Nada mas: el resto del perfume no se toca desde aqui, que para eso esta la
 * importacion CSV y el formulario.
 *
 * Las filas se casan por el ID del frasco, no por nombre y marca: asi da igual
 * que se reordene la hoja o se borren filas, y dos frascos con el mismo nombre
 * no se confunden. Este modulo no sabe de ficheros: recibe la hoja ya leida
 * como una matriz de celdas, para poder probarlo sin un .xlsx.
 */
import { normalizar } from './texto';

export const CONCENTRACIONES = ['EDC', 'EDT', 'EDP', 'EXTRAIT', 'PARFUM', 'ACEITE', 'OTRO'] as const;
export type Concentracion = (typeof CONCENTRACIONES)[number];

/** Columnas de la hoja, en orden. Solo las tres ultimas se leen al importar. */
export const COLUMNAS_HOJA = [
  { clave: 'id', titulo: 'ID', editable: false },
  { clave: 'nombre', titulo: 'Nombre', editable: false },
  { clave: 'marca', titulo: 'Marca', editable: false },
  { clave: 'concentracion', titulo: 'Concentración', editable: true },
  { clave: 'volumenMl', titulo: 'Volumen (ml)', editable: true },
  { clave: 'valoracion', titulo: 'Valoración (1-5)', editable: true },
] as const;

export type ClaveColumna = (typeof COLUMNAS_HOJA)[number]['clave'];
export type CampoEditable = 'concentracion' | 'volumenMl' | 'valoracion';

export type Celda = string | number | boolean | Date | null | undefined;

export interface DatosEditables {
  concentracion: Concentracion | null;
  volumenMl: number | null;
  valoracion: number | null;
}

export interface FilaHoja extends DatosEditables {
  id: string;
  nombre: string;
  marca: string;
}

export interface CambioPerfume {
  id: string;
  nombre: string;
  marca: string;
  antes: DatosEditables;
  despues: DatosEditables;
  /** Solo los campos que cambian, en el orden de la hoja. */
  campos: CampoEditable[];
}

export interface ErrorHoja {
  /** Fila de la hoja, contando la cabecera como la 1. */
  linea: number;
  motivo: string;
}

export interface AnalisisHoja {
  cambios: CambioPerfume[];
  errores: ErrorHoja[];
  /** Filas validas que ya coinciden con lo guardado. */
  sinCambios: number;
  /** Columnas editables que no estan en la hoja: esos campos no se tocan. */
  columnasAusentes: CampoEditable[];
}

/** Lo que pone en la hoja exportada para cada frasco. */
export function filaParaHoja(f: FilaHoja): (string | number | null)[] {
  return COLUMNAS_HOJA.map((c) => f[c.clave] ?? null);
}

/* --------------------------------------------------------------- lectura */

/**
 * Reconoce la cabecera aunque alguien la haya retocado: sin acentos ni
 * mayusculas, y por el principio ("Volumen", "Valoracion"...).
 */
function columnaDeCabecera(titulo: Celda): ClaveColumna | null {
  const t = normalizar(texto(titulo));
  if (!t) return null;
  if (t === 'id') return 'id';
  if (t.startsWith('nombre')) return 'nombre';
  if (t.startsWith('marca')) return 'marca';
  if (t.startsWith('concentracion')) return 'concentracion';
  if (t.startsWith('volumen')) return 'volumenMl';
  if (t.startsWith('valoracion')) return 'valoracion';
  return null;
}

function texto(celda: Celda): string {
  if (celda === null || celda === undefined) return '';
  if (celda instanceof Date) return celda.toISOString();
  return String(celda).trim();
}

/** Los nombres largos que alguien puede escribir a mano en vez del codigo. */
const SINONIMOS_CONCENTRACION: Record<string, Concentracion> = {
  'eau de cologne': 'EDC',
  'eau de toilette': 'EDT',
  'eau de parfum': 'EDP',
  'extrait de parfum': 'EXTRAIT',
  extracto: 'EXTRAIT',
  perfume: 'PARFUM',
  aceite: 'ACEITE',
  otro: 'OTRO',
};

type Lectura<T> = { valor: T } | { error: string };

export function leerConcentracion(celda: Celda): Lectura<Concentracion | null> {
  const t = texto(celda);
  if (!t) return { valor: null };
  const codigo = t.toUpperCase();
  if ((CONCENTRACIONES as readonly string[]).includes(codigo)) {
    return { valor: codigo as Concentracion };
  }
  const sinonimo = SINONIMOS_CONCENTRACION[normalizar(t)];
  if (sinonimo) return { valor: sinonimo };
  return {
    error: `Concentración desconocida: «${t}». Usa ${CONCENTRACIONES.join(', ')}.`,
  };
}

/** Acepta 100, "100" y "100 ml". */
export function leerVolumen(celda: Celda): Lectura<number | null> {
  const t = texto(celda).replace(/\s*ml$/i, '').replace(',', '.');
  if (!t) return { valor: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n <= 0) {
    return { error: `Volumen no válido: «${texto(celda)}». Pon los ml como número entero.` };
  }
  return { valor: n };
}

export function leerValoracion(celda: Celda): Lectura<number | null> {
  const t = texto(celda).replace(',', '.');
  if (!t) return { valor: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { error: `Valoración no válida: «${texto(celda)}». Va de 1 a 5.` };
  }
  return { valor: n };
}

/**
 * Compara la hoja con lo guardado y devuelve solo lo que cambia.
 *
 * Una celda vacia borra el dato: es lo que se ve en la hoja, y es la unica
 * forma de quitar una valoracion o un volumen que sobraban. Si una columna
 * editable no esta en la hoja, ese campo se deja como esta.
 */
export function analizarHoja(filas: Celda[][], actuales: FilaHoja[]): AnalisisHoja {
  const cabecera = filas[0];
  const vacio = { cambios: [], sinCambios: 0, columnasAusentes: [] };
  if (!cabecera || cabecera.every((c) => texto(c) === '')) {
    return { ...vacio, errores: [{ linea: 1, motivo: 'La hoja está vacía.' }] };
  }

  const posicion = new Map<ClaveColumna, number>();
  cabecera.forEach((titulo, i) => {
    const clave = columnaDeCabecera(titulo);
    if (clave && !posicion.has(clave)) posicion.set(clave, i);
  });

  if (!posicion.has('id')) {
    return {
      ...vacio,
      errores: [
        {
          linea: 1,
          motivo: 'Falta la columna «ID». Usa la hoja tal como se descarga, sin borrar columnas.',
        },
      ],
    };
  }

  const editables: CampoEditable[] = ['concentracion', 'volumenMl', 'valoracion'];
  const columnasAusentes = editables.filter((c) => !posicion.has(c));
  if (columnasAusentes.length === editables.length) {
    return {
      ...vacio,
      columnasAusentes,
      errores: [
        { linea: 1, motivo: 'No hay ninguna columna que actualizar (concentración, volumen o valoración).' },
      ],
    };
  }

  const porId = new Map(actuales.map((a) => [a.id, a]));
  const vistos = new Set<string>();
  const cambios: CambioPerfume[] = [];
  const errores: ErrorHoja[] = [];
  let sinCambios = 0;

  filas.slice(1).forEach((fila, i) => {
    const linea = i + 2;
    const celda = (clave: ClaveColumna): Celda => {
      const pos = posicion.get(clave);
      return pos === undefined ? undefined : fila[pos];
    };

    // Una fila en blanco al final de la hoja no es un error.
    if (fila.every((c) => texto(c) === '')) return;

    const id = texto(celda('id'));
    const actual = porId.get(id);
    if (!actual) {
      errores.push({
        linea,
        motivo: id
          ? 'Este ID no es de ningún perfume de tu colección.'
          : 'Fila sin ID: no se sabe a qué perfume corresponde.',
      });
      return;
    }
    if (vistos.has(id)) {
      errores.push({ linea, motivo: `«${actual.nombre}» aparece más de una vez.` });
      return;
    }
    vistos.add(id);

    const despues: DatosEditables = {
      concentracion: actual.concentracion,
      volumenMl: actual.volumenMl,
      valoracion: actual.valoracion,
    };
    const lecturas = {
      concentracion: posicion.has('concentracion') ? leerConcentracion(celda('concentracion')) : null,
      volumenMl: posicion.has('volumenMl') ? leerVolumen(celda('volumenMl')) : null,
      valoracion: posicion.has('valoracion') ? leerValoracion(celda('valoracion')) : null,
    };

    const fallos = Object.values(lecturas).flatMap((l) => (l && 'error' in l ? [l.error] : []));
    if (fallos.length > 0) {
      errores.push({ linea, motivo: `${actual.nombre}: ${fallos.join(' ')}` });
      return;
    }

    for (const campo of editables) {
      const l = lecturas[campo];
      if (l && 'valor' in l) (despues as Record<CampoEditable, unknown>)[campo] = l.valor;
    }

    const campos = editables.filter((c) => despues[c] !== actual[c]);
    if (campos.length === 0) {
      sinCambios += 1;
      return;
    }
    cambios.push({
      id,
      nombre: actual.nombre,
      marca: actual.marca,
      antes: {
        concentracion: actual.concentracion,
        volumenMl: actual.volumenMl,
        valoracion: actual.valoracion,
      },
      despues,
      campos,
    });
  });

  return { cambios, errores, sinCambios, columnasAusentes };
}
