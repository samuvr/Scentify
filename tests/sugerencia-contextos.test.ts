/** Sugerencia de contextos: mensaje, esquema de la herramienta y traduccion a ids. */
import { describe, expect, it } from 'vitest';
import {
  contextosQueEncajan,
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

  it('el esquema pide una valoración por contexto, con su clave, si encaja y el motivo', () => {
    const esquema = esquemaPropuesta(CONTEXTOS);
    const item = esquema.properties.valoraciones.items;
    expect(item.properties.clave.enum).toEqual(['oficina', 'gym', 'cita']);
    expect(item.required).toEqual(['clave', 'encaja', 'motivo']);
    expect(esquema.additionalProperties).toBe(false);
  });

  it('traduce a ids en el orden de los contextos y descarta desconocidas y repetidas', () => {
    const sugerencia = interpretarPropuesta(
      {
        valoraciones: [
          { clave: 'cita', encaja: true, motivo: ' Dulce y envolvente. ' },
          { clave: 'playa', encaja: true, motivo: 'No existe.' },
          { clave: 'cita', encaja: false, motivo: 'Repetido.' },
          { clave: 'gym', encaja: false, motivo: 'Demasiado denso para sudar.' },
          { clave: 'oficina', encaja: true, motivo: 'Proyección moderada.' },
        ],
        resumen: 'Gourmand especiado.',
      },
      CONTEXTOS,
    );
    expect(sugerencia).toEqual({
      valoraciones: [
        { id: 'id-oficina', nombre: 'Oficina', encaja: true, motivo: 'Proyección moderada.' },
        { id: 'id-gym', nombre: 'Gym', encaja: false, motivo: 'Demasiado denso para sudar.' },
        { id: 'id-cita', nombre: 'Cita', encaja: true, motivo: 'Dulce y envolvente.' },
      ],
      resumen: 'Gourmand especiado.',
    });
    expect(contextosQueEncajan(sugerencia!)).toEqual(['id-oficina', 'id-cita']);
  });

  it('una entrada sin forma no es una propuesta', () => {
    expect(interpretarPropuesta({ valoraciones: 'oficina' }, CONTEXTOS)).toBeNull();
  });
});
