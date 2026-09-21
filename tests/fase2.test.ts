/**
 * Seccion 10 — Fase 2: huecos, solapamiento en wishlist y modo viaje.
 *
 * Las tres comparten el criterio de "cubrir" con la 6.2: contexto, momento y
 * estacion a la vez. Eso se comprueba aqui explicitamente, porque si alguna se
 * desviara, la app se contradiria a si misma entre pantallas.
 */
import { describe, expect, it } from 'vitest';
import { agruparPorContexto, detectarHuecos } from '@/dominio/huecos';
import {
  detectarSolapamiento,
  explicarSolapamiento,
  notasComunes,
} from '@/dominio/solapamiento';
import { resolverViaje } from '@/dominio/viaje';
import type { PerfumeCandidato } from '@/dominio/recomendacion';
import type { Estacion, Momento } from '@/dominio/tipos';

const OFICINA = 'ctx-oficina';
const GIMNASIO = 'ctx-gimnasio';
const CITA = 'ctx-cita';
const TODOS_LOS_CONTEXTOS = [OFICINA, GIMNASIO, CITA];

function perfume(
  nombre: string,
  parcial: Partial<PerfumeCandidato> = {},
): PerfumeCandidato {
  return {
    id: `id-${nombre.toLowerCase().replaceAll(' ', '-')}`,
    nombre,
    marca: 'Lattafa',
    estado: 'LO_TENGO',
    archivado: false,
    momentos: ['DIA', 'NOCHE'],
    contextos: [OFICINA],
    estaciones: ['OTONO'],
    ultimoUso: null,
    vecesUsado: 0,
    ...parcial,
  };
}

/* ------------------------------------------------------- 10.1 huecos */

describe('detección de huecos', () => {
  it('con la colección vacía, todo son huecos', () => {
    const resultado = detectarHuecos([], TODOS_LOS_CONTEXTOS);
    // 3 contextos x 2 momentos x 4 estaciones
    expect(resultado.totalCombinaciones).toBe(24);
    expect(resultado.huecos).toHaveLength(24);
    expect(resultado.cubiertas).toBe(0);
  });

  it('un perfume solo cubre las combinaciones que tiene marcadas a la vez', () => {
    const resultado = detectarHuecos(
      [perfume('Khamrah', { contextos: [OFICINA], momentos: ['NOCHE'], estaciones: ['OTONO'] })],
      [OFICINA],
    );
    expect(resultado.cubiertas).toBe(1);
    expect(resultado.huecos).toHaveLength(7);
    expect(resultado.huecos).not.toContainEqual({
      contextoId: OFICINA,
      momento: 'NOCHE',
      estacion: 'OTONO',
    });
    // Mismo contexto y estación pero de día: sigue siendo un hueco.
    expect(resultado.huecos).toContainEqual({
      contextoId: OFICINA,
      momento: 'DIA',
      estacion: 'OTONO',
    });
  });

  it('cubrir es idoneidad 100: los tres ejes, no dos de tres', () => {
    // Marcado para Oficina+Noche y para Verano, pero no Oficina+Noche+Verano
    // por separado... en el modelo eso sí lo cubre, porque los ejes son
    // independientes. Lo que no cubre es un contexto que no tiene.
    const resultado = detectarHuecos(
      [
        perfume('Multi', {
          contextos: [OFICINA],
          momentos: ['DIA', 'NOCHE'],
          estaciones: ['VERANO', 'OTONO'],
        }),
      ],
      [OFICINA, GIMNASIO],
    );
    expect(resultado.cubiertas).toBe(4); // 1 contexto x 2 momentos x 2 estaciones
    expect(resultado.huecos.every((h) => h.contextoId === GIMNASIO || h.estacion === 'PRIMAVERA' || h.estacion === 'INVIERNO')).toBe(true);
  });

  it('los LO_TUVE y los archivados no cubren nada', () => {
    const completo = {
      contextos: [OFICINA],
      momentos: ['DIA', 'NOCHE'] as Momento[],
      estaciones: ['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'] as Estacion[],
    };
    expect(
      detectarHuecos([perfume('Vendido', { ...completo, estado: 'LO_TUVE' })], [OFICINA]).cubiertas,
    ).toBe(0);
    expect(
      detectarHuecos([perfume('Guardado', { ...completo, archivado: true })], [OFICINA]).cubiertas,
    ).toBe(0);
    expect(detectarHuecos([perfume('Bueno', completo)], [OFICINA]).cubiertas).toBe(8);
  });

  it('señala las combinaciones que dependen de un solo frasco', () => {
    const resultado = detectarHuecos(
      [
        perfume('Unico', { momentos: ['DIA'], estaciones: ['OTONO'] }),
        perfume('Otro', { momentos: ['NOCHE'], estaciones: ['OTONO'] }),
        perfume('Tercero', { momentos: ['NOCHE'], estaciones: ['OTONO'] }),
      ],
      [OFICINA],
    );
    // Oficina+Día+Otoño lo cubre solo "Unico"; Oficina+Noche+Otoño, dos.
    expect(resultado.frageles).toEqual([
      { contextoId: OFICINA, momento: 'DIA', estacion: 'OTONO', cuantos: 1 },
    ]);
  });

  it('agrupa por contexto para que se lean en el móvil', () => {
    const { huecos } = detectarHuecos([], [OFICINA, GIMNASIO]);
    const grupos = agruparPorContexto(huecos);
    expect(grupos.size).toBe(2);
    expect(grupos.get(OFICINA)).toHaveLength(8);
  });
});

/* ------------------------------------------------ 10.2 solapamiento */

describe('solapamiento en la wishlist', () => {
  const coleccion = [
    {
      id: '1',
      nombre: 'Khamrah',
      marca: 'Lattafa',
      notasFondo: ['Vainilla', 'Haba tonka', 'Benjuí', 'Mirra'],
    },
    {
      id: '2',
      nombre: 'Asad',
      marca: 'Lattafa',
      notasFondo: ['Ámbar', 'Almizcle', 'Cedro'],
    },
    {
      id: '3',
      nombre: 'Oud Sahraa',
      marca: 'Asdaaf',
      notasFondo: ['Oud', 'Sándalo'],
    },
  ];

  it('avisa a partir de tres notas de fondo compartidas', () => {
    const solapa = detectarSolapamiento(['Vainilla', 'Haba tonka', 'Benjuí'], coleccion);
    expect(solapa).toHaveLength(1);
    expect(solapa[0]?.nombre).toBe('Khamrah');
    expect(solapa[0]?.comunes).toEqual(['Vainilla', 'Haba tonka', 'Benjuí']);
  });

  it('con dos notas compartidas no avisa', () => {
    expect(detectarSolapamiento(['Vainilla', 'Haba tonka'], coleccion)).toEqual([]);
  });

  it('compara sin acentos ni mayúsculas', () => {
    const solapa = detectarSolapamiento(['vainilla', 'HABA TONKA', 'benjui'], coleccion);
    expect(solapa).toHaveLength(1);
    // Devuelve la grafía del perfume que ya tengo, no la que escribí.
    expect(solapa[0]?.comunes).toEqual(['Vainilla', 'Haba tonka', 'Benjuí']);
  });

  it('ordena de más parecido a menos', () => {
    const conMuchas = [
      ...coleccion,
      { id: '4', nombre: 'Casi igual', marca: 'X', notasFondo: ['Vainilla', 'Haba tonka', 'Benjuí', 'Mirra'] },
    ];
    const solapa = detectarSolapamiento(['Vainilla', 'Haba tonka', 'Benjuí', 'Mirra'], conMuchas);
    expect(solapa.map((s) => s.nombre)).toEqual(['Casi igual', 'Khamrah']);
    expect(solapa[0]?.comunes).toHaveLength(4);
  });

  it('un deseo sin notas no dispara ningún aviso', () => {
    expect(detectarSolapamiento([], coleccion)).toEqual([]);
  });

  it('no cuenta dos veces la misma nota repetida en el deseo', () => {
    expect(notasComunes(['Vainilla', 'vainilla', 'Mirra'], ['Vainilla', 'Mirra'])).toEqual([
      'Vainilla',
      'Mirra',
    ]);
  });

  it('el aviso se lee como una frase', () => {
    const solapa = detectarSolapamiento(['Vainilla', 'Haba tonka', 'Benjuí'], coleccion);
    expect(explicarSolapamiento(solapa)).toBe('Se parece a Khamrah, que ya tienes.');
    expect(explicarSolapamiento([])).toBe('');
  });
});

/* ------------------------------------------------------ 10.3 viaje */

describe('modo viaje', () => {
  const estaciones: Estacion[] = ['VERANO'];

  it('un frasco que lo cubre todo va solo', () => {
    const resultado = resolverViaje({
      coleccion: [
        perfume('Comodín', {
          contextos: [OFICINA, GIMNASIO, CITA],
          momentos: ['DIA', 'NOCHE'],
          estaciones: ['VERANO'],
        }),
        perfume('Especialista', { contextos: [OFICINA], estaciones: ['VERANO'] }),
      ],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: estaciones,
    });
    expect(resultado.frascos.map((f) => f.perfume.nombre)).toEqual(['Comodín']);
    expect(resultado.sinCubrir).toEqual([]);
    expect(resultado.esOptimo).toBe(true);
  });

  it('encuentra el mínimo de verdad, no el que sale del voraz', () => {
    // El voraz elegiría primero "Goloso" (cubre 3) y luego necesitaría dos más.
    // El óptimo son dos: "Par A" + "Par B".
    const resultado = resolverViaje({
      coleccion: [
        perfume('Goloso', {
          contextos: [OFICINA, GIMNASIO, CITA],
          momentos: ['DIA'],
          estaciones: ['VERANO'],
        }),
        perfume('Par A', {
          contextos: [OFICINA, GIMNASIO],
          momentos: ['DIA', 'NOCHE'],
          estaciones: ['VERANO'],
        }),
        perfume('Par B', {
          contextos: [CITA],
          momentos: ['DIA', 'NOCHE'],
          estaciones: ['VERANO'],
        }),
      ],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: estaciones,
    });
    expect(resultado.frascos).toHaveLength(2);
    expect(resultado.frascos.map((f) => f.perfume.nombre).sort()).toEqual(['Par A', 'Par B']);
    expect(resultado.sinCubrir).toEqual([]);
  });

  it('usa la estación del destino, no la de casa', () => {
    const soloInvierno = perfume('De invierno', {
      contextos: TODOS_LOS_CONTEXTOS,
      estaciones: ['INVIERNO'],
    });
    const soloVerano = perfume('De verano', {
      contextos: TODOS_LOS_CONTEXTOS,
      estaciones: ['VERANO'],
    });

    const aCanarias = resolverViaje({
      coleccion: [soloInvierno, soloVerano],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: ['VERANO'],
    });
    expect(aCanarias.frascos.map((f) => f.perfume.nombre)).toEqual(['De verano']);

    const aLaptonia = resolverViaje({
      coleccion: [soloInvierno, soloVerano],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: ['INVIERNO'],
    });
    expect(aLaptonia.frascos.map((f) => f.perfume.nombre)).toEqual(['De invierno']);
  });

  it('dice qué requisitos no cubre nada de la colección', () => {
    const resultado = resolverViaje({
      coleccion: [perfume('Solo oficina', { contextos: [OFICINA], estaciones: ['VERANO'] })],
      contextoIds: [OFICINA, GIMNASIO],
      estacionesCompatibles: estaciones,
    });
    expect(resultado.frascos).toHaveLength(1);
    expect(resultado.sinCubrir).toEqual([
      { contextoId: GIMNASIO, momento: 'DIA' },
      { contextoId: GIMNASIO, momento: 'NOCHE' },
    ]);
  });

  it('cada frasco dice qué aporta, sin repetir lo que ya cubría otro', () => {
    const resultado = resolverViaje({
      coleccion: [
        perfume('Par A', {
          contextos: [OFICINA, GIMNASIO],
          momentos: ['DIA', 'NOCHE'],
          estaciones: ['VERANO'],
        }),
        perfume('Par B', {
          contextos: [GIMNASIO, CITA],
          momentos: ['DIA', 'NOCHE'],
          estaciones: ['VERANO'],
        }),
      ],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: estaciones,
    });
    const aportes = resultado.frascos.flatMap((f) => f.cubre);
    // Seis requisitos en total, repartidos sin solaparse.
    expect(aportes).toHaveLength(6);
    expect(new Set(aportes.map((r) => `${r.contextoId}-${r.momento}`)).size).toBe(6);
  });

  it('respeta el tope de maleta y dice qué se queda fuera', () => {
    const resultado = resolverViaje({
      coleccion: [
        perfume('A', { contextos: [OFICINA], momentos: ['DIA', 'NOCHE'], estaciones: ['VERANO'] }),
        perfume('B', { contextos: [GIMNASIO], momentos: ['DIA', 'NOCHE'], estaciones: ['VERANO'] }),
        perfume('C', { contextos: [CITA], momentos: ['DIA', 'NOCHE'], estaciones: ['VERANO'] }),
      ],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: estaciones,
      maximoFrascos: 2,
    });
    expect(resultado.frascos).toHaveLength(2);
    expect(resultado.sinCubrir).toHaveLength(2);
    expect(resultado.esOptimo).toBe(false);
  });

  it('solo de noche: no mete frascos para cubrir el día', () => {
    const resultado = resolverViaje({
      coleccion: [
        perfume('De noche', {
          contextos: TODOS_LOS_CONTEXTOS,
          momentos: ['NOCHE'],
          estaciones: ['VERANO'],
        }),
        perfume('De día', {
          contextos: TODOS_LOS_CONTEXTOS,
          momentos: ['DIA'],
          estaciones: ['VERANO'],
        }),
      ],
      contextoIds: TODOS_LOS_CONTEXTOS,
      momentos: ['NOCHE'],
      estacionesCompatibles: estaciones,
    });
    expect(resultado.frascos.map((f) => f.perfume.nombre)).toEqual(['De noche']);
  });

  it('a igualdad de cobertura prefiere el que mejor valoras', () => {
    const base = {
      contextos: TODOS_LOS_CONTEXTOS,
      momentos: ['DIA', 'NOCHE'] as Momento[],
      estaciones: ['VERANO'] as Estacion[],
    };
    const resultado = resolverViaje({
      coleccion: [
        perfume('Mediocre', {
          ...base,
          promedios: { spraysHabituales: 5, duracionEsperada: null, valoracionMedia: 2 },
        }),
        perfume('Favorito', {
          ...base,
          promedios: { spraysHabituales: 5, duracionEsperada: null, valoracionMedia: 5 },
        }),
      ],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: estaciones,
    });
    expect(resultado.frascos.map((f) => f.perfume.nombre)).toEqual(['Favorito']);
  });

  it('los LO_TUVE y archivados no se meten en la maleta', () => {
    const resultado = resolverViaje({
      coleccion: [
        perfume('Vendido', { contextos: TODOS_LOS_CONTEXTOS, estado: 'LO_TUVE', estaciones: ['VERANO'] }),
        perfume('Guardado', { contextos: TODOS_LOS_CONTEXTOS, archivado: true, estaciones: ['VERANO'] }),
      ],
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: estaciones,
    });
    expect(resultado.frascos).toEqual([]);
    expect(resultado.sinCubrir).toHaveLength(6);
  });

  it('sin contextos previstos no propone nada', () => {
    const resultado = resolverViaje({
      coleccion: [perfume('X')],
      contextoIds: [],
      estacionesCompatibles: estaciones,
    });
    expect(resultado.frascos).toEqual([]);
    expect(resultado.sinCubrir).toEqual([]);
  });

  it('el resultado es estable: dos consultas iguales dan la misma maleta', () => {
    const coleccion = [
      perfume('Alfa', { contextos: [OFICINA, GIMNASIO], estaciones: ['VERANO'] }),
      perfume('Beta', { contextos: [OFICINA, GIMNASIO], estaciones: ['VERANO'] }),
      perfume('Gamma', { contextos: [CITA], estaciones: ['VERANO'] }),
    ];
    const peticion = {
      coleccion,
      contextoIds: TODOS_LOS_CONTEXTOS,
      estacionesCompatibles: estaciones,
    };
    const a = resolverViaje(peticion).frascos.map((f) => f.perfume.nombre);
    const b = resolverViaje(peticion).frascos.map((f) => f.perfume.nombre);
    expect(a).toEqual(b);
  });
});
