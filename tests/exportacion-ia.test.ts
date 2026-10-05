/** Exportacion de la coleccion para un asistente de IA. */
import { describe, expect, it } from 'vitest';
import { documentoParaIa, type PerfumeExportable } from '@/dominio/exportacion-ia';

function perfume(datos: Partial<PerfumeExportable> = {}): PerfumeExportable {
  return {
    nombre: 'Khamrah',
    marca: 'Lattafa',
    concentracion: 'EDP',
    anioLanzamiento: 2022,
    volumenMl: 100,
    fechaCompra: null,
    estado: 'LO_TENGO',
    archivado: false,
    valoracion: 4,
    notasPersonales: null,
    notas: { salida: ['Canela', 'Bergamota'], corazon: ['Dátil'], fondo: ['Vainilla', 'Canela'] },
    familias: ['Ámbar', 'Gourmand'],
    contextos: ['Cita'],
    estaciones: ['OTONO', 'INVIERNO'],
    momentos: ['NOCHE'],
    uso: null,
    ...datos,
  };
}

const BASE = { deseos: [], ubicacion: 'Madrid', hoy: '2026-10-05' };

describe('documento para IA', () => {
  it('traduce las marcas a castellano legible y no saca ids ni vacíos', () => {
    const doc = documentoParaIa({ ...BASE, perfumes: [perfume()] });
    const [p] = doc.coleccion;

    expect(p).toMatchObject({
      nombre: 'Khamrah',
      estaciones: ['otoño', 'invierno'],
      momentos: ['noche'],
      uso: { veces: 0 },
    });
    expect(p).not.toHaveProperty('fecha_compra');
    expect(p).not.toHaveProperty('mis_notas');
    expect(JSON.stringify(doc)).not.toMatch(/"id"/);
    expect(doc.ubicacion_habitual).toBe('Madrid');
  });

  it('resume el uso con la duración en palabras', () => {
    const doc = documentoParaIa({
      ...BASE,
      perfumes: [
        perfume({
          uso: {
            vecesUsado: 7,
            ultimoUso: '2026-09-30',
            valoracionMedia: 4.3,
            spraysHabituales: 4,
            duracionEsperada: 'MAS_8H',
          },
        }),
      ],
    });
    expect(doc.coleccion[0]?.uso).toEqual({
      veces: 7,
      ultimo_dia: '2026-09-30',
      valoracion_media_del_dia: 4.3,
      sprays_habituales: 4,
      duracion_habitual: 'más de 8 h',
    });
  });

  it('separa lo que tengo de lo que tuve y deja fuera lo archivado', () => {
    const doc = documentoParaIa({
      ...BASE,
      perfumes: [
        perfume(),
        perfume({ nombre: 'Sauvage', estado: 'LO_TUVE', notasPersonales: ' Me cansó ' }),
        perfume({ nombre: 'Oculto', archivado: true }),
      ],
    });
    expect(doc.coleccion.map((p) => p.nombre)).toEqual(['Khamrah']);
    expect(doc.ya_no_tengo).toEqual([
      { nombre: 'Sauvage', marca: 'Lattafa', concentracion: 'EDP', valoracion: 4, mis_notas: 'Me cansó' },
    ]);
    expect(doc.resumen.perfumes).toBe(1);
  });

  it('cuenta cada nota una vez por perfume, de más a menos frecuente', () => {
    const doc = documentoParaIa({
      ...BASE,
      perfumes: [
        perfume(),
        perfume({
          nombre: 'Otro',
          notas: { salida: ['Bergamota'], corazon: [], fondo: ['Almizcle'] },
          familias: ['Cítrico'],
        }),
      ],
    });
    expect(doc.resumen.notas).toEqual({
      Bergamota: 2,
      Almizcle: 1,
      Canela: 1,
      Dátil: 1,
      Vainilla: 1,
    });
    expect(Object.keys(doc.resumen.notas)[0]).toBe('Bergamota');
  });

  it('incluye la lista de deseos con la prioridad en palabras', () => {
    const doc = documentoParaIa({
      ...BASE,
      perfumes: [],
      deseos: [
        { nombre: 'Aventus', marca: 'Creed', prioridad: 'LO_NECESITO', precioObjetivo: '250.00', notas: null },
      ],
    });
    expect(doc.lista_de_deseos).toEqual([
      { nombre: 'Aventus', marca: 'Creed', prioridad: 'lo necesito', precio_maximo: '250.00' },
    ]);
    expect(doc.coleccion).toEqual([]);
    expect(doc).not.toHaveProperty('ya_no_tengo');
  });
});
