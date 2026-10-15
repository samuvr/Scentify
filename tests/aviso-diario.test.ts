import { describe, expect, it } from 'vitest';
import { decidirAviso, textoApuntado, type PlantillaUso } from '@/dominio/aviso-diario';

const HOY = '2026-10-15';
const asad: PlantillaUso = {
  perfumeId: 'p-asad',
  nombre: 'Asad',
  momento: 'DIA',
  contextoId: 'c-oficina',
  contexto: 'Oficina',
  sprays: 6,
};
const khamrah: PlantillaUso = { ...asad, perfumeId: 'p-khamrah', nombre: 'Khamrah', momento: 'NOCHE', contexto: 'Cita' };

describe('decidirAviso', () => {
  it('sin registro hoy: repetir lo de ayer y lo de siempre', () => {
    const aviso = decidirAviso({ hoy: HOY, usosDeHoy: [], ayer: asad, habitual: khamrah, preguntarCierre: true })!;
    expect(aviso.tipo).toBe('registrar');
    expect(aviso.acciones.map((a) => a.titulo)).toEqual(['Repetir: Asad', 'Lo de siempre: Khamrah']);
    // Se repite con el momento y el contexto de ayer, no con «Noche» por la hora del aviso.
    expect(aviso.acciones[0]!.registrar).toMatchObject({ momento: 'DIA', contextoId: 'c-oficina', fecha: HOY });
    expect(aviso.url).toBe('/');
    expect(aviso.urlSinAcciones).toBe('/?toque=ayer');
  });

  it('no repite el mismo perfume en los dos botones', () => {
    const aviso = decidirAviso({ hoy: HOY, usosDeHoy: [], ayer: asad, habitual: asad, preguntarCierre: true })!;
    expect(aviso.acciones).toHaveLength(1);
  });

  it('sin nada que proponer, solo abre Hoy', () => {
    const aviso = decidirAviso({ hoy: HOY, usosDeHoy: [], ayer: null, habitual: null, preguntarCierre: true })!;
    expect(aviso.acciones).toEqual([]);
    expect(aviso.urlSinAcciones).toBe('/');
    expect(aviso.cuerpo).toBe('Todavía no has registrado ningún perfume.');
  });

  it('con un uso sin cerrar, pregunta qué tal con las duraciones', () => {
    const aviso = decidirAviso({
      hoy: HOY,
      usosDeHoy: [{ id: 'u1', nombre: 'Khamrah', valoracionDia: null, duracionPercibida: null }],
      ayer: asad,
      habitual: null,
      preguntarCierre: true,
    })!;
    expect(aviso.tipo).toBe('cerrar');
    expect(aviso.titulo).toBe('¿Qué tal aguantó Khamrah?');
    expect(aviso.acciones.map((a) => a.completar)).toEqual([
      { usoId: 'u1', duracionPercibida: 'DE_4_6H' },
      { usoId: 'u1', duracionPercibida: 'MAS_8H' },
    ]);
    expect(aviso.url).toBe('/?cierre=1');
  });

  it('con la duración ya puesta, solo invita a valorar', () => {
    const aviso = decidirAviso({
      hoy: HOY,
      usosDeHoy: [{ id: 'u1', nombre: 'Khamrah', valoracionDia: null, duracionPercibida: 'DE_2_4H' }],
      ayer: null,
      habitual: null,
      preguntarCierre: true,
    })!;
    expect(aviso.acciones).toEqual([]);
  });

  it('con todo cerrado, o sin «Pregúntame qué tal», no avisa', () => {
    const cerrado = [{ id: 'u1', nombre: 'Khamrah', valoracionDia: 4, duracionPercibida: 'MAS_8H' as const }];
    expect(decidirAviso({ hoy: HOY, usosDeHoy: cerrado, ayer: null, habitual: null, preguntarCierre: true })).toBeNull();
    const abierto = [{ ...cerrado[0]!, valoracionDia: null }];
    expect(decidirAviso({ hoy: HOY, usosDeHoy: abierto, ayer: null, habitual: null, preguntarCierre: false })).toBeNull();
  });

  it('la confirmación dice qué se ha apuntado', () => {
    expect(textoApuntado(asad)).toBe('Apuntado: Asad · Día · Oficina');
  });
});
