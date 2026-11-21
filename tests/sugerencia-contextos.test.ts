/** Sugerencia de contextos: el prompt que se copia a la app de Claude. */
import { describe, expect, it } from 'vitest';
import { INSTRUCCIONES_SUGERENCIA, promptSugerencia } from '@/dominio/sugerencia-contextos';

const CONTEXTOS = ['Oficina', 'Gym', 'Cita'];

describe('prompt de sugerencia de contextos', () => {
  it('lleva las instrucciones, el perfume, las notas por nivel, las familias y los contextos', () => {
    const texto = promptSugerencia(
      {
        nombre: 'Khamrah',
        marca: 'Lattafa',
        concentracion: 'EDP',
        anio: '2022',
        notas: [
          { nombre: 'Canela', nivel: 'SALIDA' },
          { nombre: 'Dátil', nivel: 'CORAZON' },
          { nombre: 'Vainilla', nivel: 'FONDO' },
        ],
        familias: ['Gourmand'],
        fragranticaUrl: 'https://www.fragrantica.es/perfume/Lattafa-Perfumes/Khamrah-75805.html',
      },
      CONTEXTOS,
    );
    expect(texto.startsWith(INSTRUCCIONES_SUGERENCIA)).toBe(true);
    expect(texto).toContain('Khamrah de Lattafa (EDP, 2022)');
    expect(texto).toContain('Ficha de Fragrantica: https://www.fragrantica.es/perfume/');
    expect(texto).toContain('- salida: Canela');
    expect(texto).toContain('- corazón: Dátil');
    expect(texto).toContain('- fondo: Vainilla');
    expect(texto).toContain('Familias: Gourmand');
    expect(texto).toContain('- Oficina\n- Gym\n- Cita');
    expect(texto).toContain('Contextos a marcar:');
  });

  it('sin notas pide que las busque y omite lo que no hay', () => {
    const texto = promptSugerencia({ nombre: 'Aventus', marca: 'Creed', notas: [], familias: [] }, CONTEXTOS);
    expect(texto).toContain('Aventus de Creed\n');
    expect(texto).toContain('no las tengo; búscalas');
    expect(texto).not.toContain('Familias:');
    expect(texto).not.toContain('Ficha de Fragrantica');
  });
});
