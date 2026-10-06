/** Sugerencia de contextos: mensaje, esquema de la herramienta y traduccion a ids. */
import { describe, expect, it } from 'vitest';
import {
  esquemaPeticionSugerencia,
  esquemaPropuesta,
  interpretarPropuesta,
  mensajeSugerencia,
} from '@/dominio/sugerencia-contextos';

const CONTEXTOS = [
  { id: 'id-oficina', slug: 'oficina', nombre: 'Oficina' },
  { id: 'id-gym', slug: 'gym', nombre: 'Gym' },
  { id: 'id-cita', slug: 'cita', nombre: 'Cita' },
];

describe('sugerencia de contextos', () => {
  it('el mensaje lleva el perfume, las notas por nivel y las claves de los contextos', () => {
    const perfume = esquemaPeticionSugerencia.parse({
      nombre: 'Khamrah',
      marca: 'Lattafa',
      concentracion: 'EDP',
      notas: [
        { nombre: 'Canela', nivel: 'SALIDA' },
        { nombre: 'Dátil', nivel: 'CORAZON' },
        { nombre: 'Vainilla', nivel: 'FONDO' },
      ],
      familias: ['Gourmand'],
    });
    const texto = mensajeSugerencia(perfume, CONTEXTOS);
    expect(texto).toContain('Khamrah de Lattafa (EDP)');
    expect(texto).toContain('- salida: Canela');
    expect(texto).toContain('- fondo: Vainilla');
    expect(texto).toContain('Familias: Gourmand');
    expect(texto).toContain('- gym: Gym');
  });

  it('sin notas pide que las busque', () => {
    const perfume = esquemaPeticionSugerencia.parse({ nombre: 'Aventus', marca: 'Creed' });
    expect(mensajeSugerencia(perfume, CONTEXTOS)).toContain('sin indicar; búscalas');
  });

  it('el esquema solo admite las claves de los contextos', () => {
    const esquema = esquemaPropuesta(CONTEXTOS);
    expect(esquema.properties.contextos.items.properties.clave.enum).toEqual(['oficina', 'gym', 'cita']);
    expect(esquema.additionalProperties).toBe(false);
  });

  it('traduce claves a ids y descarta las desconocidas y repetidas', () => {
    const sugerencia = interpretarPropuesta(
      {
        contextos: [
          { clave: 'cita', motivo: ' Dulce y envolvente. ' },
          { clave: 'playa', motivo: 'No existe.' },
          { clave: 'cita', motivo: 'Repetido.' },
          { clave: 'oficina', motivo: 'Proyección moderada.' },
        ],
        resumen: 'Gourmand especiado.',
      },
      CONTEXTOS,
    );
    expect(sugerencia).toEqual({
      contextos: [
        { id: 'id-cita', nombre: 'Cita', motivo: 'Dulce y envolvente.' },
        { id: 'id-oficina', nombre: 'Oficina', motivo: 'Proyección moderada.' },
      ],
      resumen: 'Gourmand especiado.',
    });
  });

  it('una entrada sin forma no es una propuesta', () => {
    expect(interpretarPropuesta({ contextos: 'oficina' }, CONTEXTOS)).toBeNull();
  });
});
