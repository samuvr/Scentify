/**
 * Seccion 7.2 — Motor de recomendacion.
 *
 * Filtros duros: estado = LO_TENGO y no archivado.
 *   1. Candidatos con idoneidad 100.
 *   2. Orden por dias desde el ultimo uso, de mas a menos.
 *   3. Los tres primeros.
 *   4. Si hay menos de tres, se completa con idoneidad 67 marcados como parciales,
 *      indicando que eje falla.
 * Debajo, bloque aparte de hasta 3 "Nunca los has usado".
 *
 * Decidido con el usuario: los perfumes sin ningun registro salen SOLO en su
 * bloque; la lista principal ordena unicamente perfumes con historial. Asi no se
 * repite ninguna tarjeta en pantalla.
 */
import { describe, expect, it } from 'vitest';
import { recomendar } from '@/dominio/recomendacion';
import type { PerfumeCandidato, PeticionRecomendacion } from '@/dominio/recomendacion';

const OFICINA = 'ctx-oficina';
const CASA = 'ctx-casa';
const HOY = '2026-11-15';

/** Perfume que encaja en todo por defecto: Oficina, Día y otoño. */
function candidato(
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
    contextos: [OFICINA, CASA],
    estaciones: ['OTONO', 'INVIERNO'],
    ultimoUso: null,
    vecesUsado: 0,
    ...parcial,
  };
}

/** Perfume con historial: usado por ultima vez hace `dias` dias. */
function usadoHace(nombre: string, dias: number, parcial: Partial<PerfumeCandidato> = {}) {
  const fecha = new Date(`${HOY}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return candidato(nombre, {
    ultimoUso: fecha.toISOString().slice(0, 10),
    vecesUsado: 3,
    ...parcial,
  });
}

const peticion = (
  coleccion: PerfumeCandidato[],
  parcial: Partial<PeticionRecomendacion> = {},
): PeticionRecomendacion => ({
  coleccion,
  momento: 'DIA',
  contextoId: OFICINA,
  estacionesCompatibles: ['OTONO'],
  hoy: HOY,
  ...parcial,
});

const nombres = (lista: { perfume: PerfumeCandidato }[]) => lista.map((r) => r.perfume.nombre);

describe('filtros duros', () => {
  it('deja fuera los LO_TUVE (criterio 9)', () => {
    const resultado = recomendar(
      peticion([
        usadoHace('Khamrah', 40),
        usadoHace('Asad', 30, { estado: 'LO_TUVE' }),
      ]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['Khamrah']);
  });

  it('deja fuera los archivados', () => {
    const resultado = recomendar(
      peticion([usadoHace('Khamrah', 40), usadoHace('Asad', 50, { archivado: true })]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['Khamrah']);
  });

  it('el filtro de archivado tambien se aplica al bloque de nunca usados', () => {
    const resultado = recomendar(
      peticion([candidato('Nuevo'), candidato('Guardado', { archivado: true })]),
    );
    expect(resultado.nuncaUsados.map((p) => p.nombre)).toEqual(['Nuevo']);
  });
});

describe('orden por dias desde el ultimo uso, de mas a menos', () => {
  it('ordena los de idoneidad total por tiempo sin usar', () => {
    const resultado = recomendar(
      peticion([
        usadoHace('Reciente', 2),
        usadoHace('Antiguo', 120),
        usadoHace('Medio', 47),
      ]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['Antiguo', 'Medio', 'Reciente']);
    expect(resultado.recomendaciones[0]?.diasSinUsar).toBe(120);
    expect(resultado.recomendaciones[2]?.diasSinUsar).toBe(2);
  });

  it('devuelve como mucho tres (criterio 8)', () => {
    const resultado = recomendar(
      peticion([
        usadoHace('A', 10),
        usadoHace('B', 20),
        usadoHace('C', 30),
        usadoHace('D', 40),
        usadoHace('E', 50),
      ]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['E', 'D', 'C']);
  });

  it('un uso de hoy cuenta como cero dias sin usar y va el ultimo', () => {
    const resultado = recomendar(peticion([usadoHace('Hoy', 0), usadoHace('Ayer', 1)]));
    expect(nombres(resultado.recomendaciones)).toEqual(['Ayer', 'Hoy']);
    expect(resultado.recomendaciones[1]?.diasSinUsar).toBe(0);
    // «Llevas 0 días sin ponértelo» no es una frase que diga nadie.
    expect(resultado.recomendaciones[1]?.explicacion).toMatch(/^Te lo has puesto hoy/);
    expect(resultado.recomendaciones[1]?.explicacion).not.toContain('0 días');
  });

  it('a igualdad de dias desempata por nombre, para que el orden sea estable', () => {
    const resultado = recomendar(
      peticion([usadoHace('Yara', 30), usadoHace('Asad', 30), usadoHace('Khamrah', 30)]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['Asad', 'Khamrah', 'Yara']);
  });
});

describe('los nunca usados van solo en su bloque', () => {
  it('no aparecen en la lista principal aunque tengan idoneidad total', () => {
    const resultado = recomendar(peticion([usadoHace('Khamrah', 5), candidato('Sin estrenar')]));
    expect(nombres(resultado.recomendaciones)).toEqual(['Khamrah']);
    expect(resultado.nuncaUsados.map((p) => p.nombre)).toEqual(['Sin estrenar']);
  });

  it('ninguna tarjeta se repite entre los dos bloques', () => {
    const resultado = recomendar(
      peticion([usadoHace('A', 10), candidato('B'), candidato('C'), usadoHace('D', 90)]),
    );
    const arriba = new Set(resultado.recomendaciones.map((r) => r.perfume.id));
    for (const p of resultado.nuncaUsados) expect(arriba.has(p.id)).toBe(false);
  });

  it('el bloque de nunca usados se corta en tres', () => {
    const resultado = recomendar(
      peticion([candidato('A'), candidato('B'), candidato('C'), candidato('D')]),
    );
    expect(resultado.nuncaUsados).toHaveLength(3);
  });

  it('el bloque solo exige los filtros duros, no idoneidad total', () => {
    // Marcado solo para noche: idoneidad 67 pidiendo de dia. Sigue siendo un
    // perfume sin estrenar de la coleccion, que es lo que el bloque enseña.
    const resultado = recomendar(peticion([candidato('Nocturno', { momentos: ['NOCHE'] })]));
    expect(resultado.nuncaUsados.map((p) => p.nombre)).toEqual(['Nocturno']);
  });

  it('con la coleccion entera estrenada el bloque queda vacio', () => {
    const resultado = recomendar(peticion([usadoHace('A', 10), usadoHace('B', 20)]));
    expect(resultado.nuncaUsados).toEqual([]);
  });
});

describe('relleno con coincidencias parciales', () => {
  it('completa hasta tres con idoneidad 67 marcados como parciales', () => {
    const resultado = recomendar(
      peticion([
        usadoHace('Total', 10),
        usadoHace('SoloNoche', 90, { momentos: ['NOCHE'] }),
        usadoHace('OtroContexto', 80, { contextos: [CASA] }),
      ]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['Total', 'SoloNoche', 'OtroContexto']);
    expect(resultado.recomendaciones.map((r) => r.parcial)).toEqual([false, true, true]);
    expect(resultado.recomendaciones.map((r) => r.idoneidad.pct)).toEqual([100, 67, 67]);
  });

  it('las totales van siempre antes que las parciales, aunque lleven menos tiempo sin usar', () => {
    const resultado = recomendar(
      peticion([
        usadoHace('ParcialAntigua', 300, { momentos: ['NOCHE'] }),
        usadoHace('TotalReciente', 1),
      ]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['TotalReciente', 'ParcialAntigua']);
  });

  it('las parciales tambien se ordenan entre si por tiempo sin usar', () => {
    const resultado = recomendar(
      peticion([
        usadoHace('ParcialNueva', 5, { momentos: ['NOCHE'] }),
        usadoHace('ParcialVieja', 200, { momentos: ['NOCHE'] }),
      ]),
    );
    expect(nombres(resultado.recomendaciones)).toEqual(['ParcialVieja', 'ParcialNueva']);
  });

  it('indica que eje falla en cada parcial', () => {
    const resultado = recomendar(
      peticion([usadoHace('SoloNoche', 90, { momentos: ['NOCHE'] })]),
    );
    const parcial = resultado.recomendaciones[0];
    expect(parcial?.idoneidad.detalle).toEqual({
      momento: false,
      contexto: true,
      estacion: true,
    });
    expect(parcial?.ejesQueFallan).toEqual(['momento']);
    expect(parcial?.explicacion).toContain('marcado solo para noche');
  });

  it('nunca baja de 67: una idoneidad de 33 no entra ni para rellenar', () => {
    const resultado = recomendar(
      peticion([usadoHace('Malo', 500, { momentos: ['NOCHE'], contextos: [CASA] })]),
    );
    expect(resultado.recomendaciones).toEqual([]);
  });
});

describe('boton "Otro": descarta y muestra la siguiente (criterio 8)', () => {
  const coleccion = [
    usadoHace('A', 100),
    usadoHace('B', 80),
    usadoHace('C', 60),
    usadoHace('D', 40),
  ];

  it('sin descartes devuelve las tres primeras', () => {
    expect(nombres(recomendar(peticion(coleccion)).recomendaciones)).toEqual(['A', 'B', 'C']);
  });

  it('al descartar una entra la cuarta en su lugar', () => {
    const resultado = recomendar(peticion(coleccion, { descartados: ['id-b'] }));
    expect(nombres(resultado.recomendaciones)).toEqual(['A', 'C', 'D']);
  });

  it('los descartes se acumulan durante el dia', () => {
    const resultado = recomendar(peticion(coleccion, { descartados: ['id-a', 'id-b'] }));
    expect(nombres(resultado.recomendaciones)).toEqual(['C', 'D']);
  });

  it('descartar tambien saca del bloque de nunca usados', () => {
    const resultado = recomendar(
      peticion([candidato('Nuevo'), candidato('Otro nuevo')], { descartados: ['id-nuevo'] }),
    );
    expect(resultado.nuncaUsados.map((p) => p.nombre)).toEqual(['Otro nuevo']);
  });
});

describe('explicacion de cada recomendacion', () => {
  it('el motivo es la explicacion sin los promedios, que la tarjeta pinta aparte', () => {
    const resultado = recomendar(
      peticion([
        usadoHace('Khamrah', 47, {
          promedios: { spraysHabituales: 6, duracionEsperada: 'DE_6_8H', valoracionMedia: 4 },
        }),
      ]),
    );
    const [r] = resultado.recomendaciones;
    expect(r?.explicacion).toContain('sueles echarte 6 sprays');
    expect(r?.motivo).toContain('Llevas 47 días sin ponértelo');
    expect(r?.motivo).not.toContain('sprays');
    expect(r?.motivo).not.toContain('durar');
    expect(r?.motivo.endsWith('.')).toBe(true);
  });

  it('junta tiempo sin usar, encaje y promedios (ejemplo de la especificacion)', () => {
    const resultado = recomendar(
      peticion(
        [
          usadoHace('Khamrah', 47, {
            promedios: { spraysHabituales: 6, duracionEsperada: 'DE_6_8H', valoracionMedia: 4.5 },
          }),
        ],
        { nombreContexto: 'Oficina' },
      ),
    );
    expect(resultado.recomendaciones[0]?.explicacion).toBe(
      'Llevas 47 días sin ponértelo · encaja con Oficina, Día y otoño · sueles echarte 6 sprays · te suele durar 6-8h.',
    );
  });

  it('omite los promedios que no existen todavia', () => {
    const resultado = recomendar(
      peticion([usadoHace('Khamrah', 47)], { nombreContexto: 'Oficina' }),
    );
    const explicacion = resultado.recomendaciones[0]?.explicacion ?? '';
    expect(explicacion).toContain('Llevas 47 días sin ponértelo');
    expect(explicacion).not.toContain('sprays');
    expect(explicacion).not.toContain('durar');
  });

  it('el singular de un dia esta bien escrito', () => {
    const resultado = recomendar(peticion([usadoHace('Khamrah', 1)], { nombreContexto: 'Oficina' }));
    expect(resultado.recomendaciones[0]?.explicacion).toContain('Llevas 1 día sin ponértelo');
  });
});

describe('casos limite', () => {
  it('una coleccion vacia no revienta', () => {
    const resultado = recomendar(peticion([]));
    expect(resultado.recomendaciones).toEqual([]);
    expect(resultado.nuncaUsados).toEqual([]);
  });

  it('no muta la coleccion que recibe', () => {
    const coleccion = [usadoHace('B', 10), usadoHace('A', 20)];
    const copia = coleccion.map((p) => p.nombre);
    recomendar(peticion(coleccion));
    expect(coleccion.map((p) => p.nombre)).toEqual(copia);
  });

  it('el limite es configurable para la pantalla que lo necesite', () => {
    const resultado = recomendar(
      peticion([usadoHace('A', 10), usadoHace('B', 20), usadoHace('C', 30), usadoHace('D', 40)], {
        limite: 2,
      }),
    );
    expect(resultado.recomendaciones).toHaveLength(2);
  });

  it('un perfume con vecesUsado 0 pero con fecha de ultimo uso se trata como usado', () => {
    // Incoherencia defensiva: manda la fecha, que es el dato que ordena.
    const resultado = recomendar(peticion([candidato('Raro', { ultimoUso: '2026-01-01' })]));
    expect(nombres(resultado.recomendaciones)).toEqual(['Raro']);
    expect(resultado.nuncaUsados).toEqual([]);
  });
});
