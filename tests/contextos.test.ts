import { describe, expect, it } from 'vitest';
import {
  admiteMomento,
  contextoParaMomento,
  contextosDelMomento,
  fraccionDelMomento,
  frecuenciaReal,
  leerAjusteContexto,
  momentosDe,
  momentosPorContexto,
} from '@/dominio/contextos';
import { detectarHuecos } from '@/dominio/huecos';

const OFICINA = { id: 'oficina', atemporal: false, momentos: ['DIA'] as const };
const CITA = { id: 'cita', atemporal: false, momentos: ['DIA', 'NOCHE'] as const };
const GIMNASIO = { id: 'gimnasio', atemporal: true, momentos: ['DIA'] as const };
const CONTEXTOS = [OFICINA, GIMNASIO, CITA].map((c) => ({ ...c, momentos: [...c.momentos] }));

describe('momentos de un contexto', () => {
  it('la oficina solo existe de día; el atemporal a cualquier hora', () => {
    expect(momentosDe(OFICINA)).toEqual(['DIA']);
    expect(admiteMomento(OFICINA, 'NOCHE')).toBe(false);
    // Atemporal manda sobre los momentos guardados.
    expect(momentosDe(GIMNASIO)).toEqual(['DIA', 'NOCHE']);
    // Sin ninguno se trata como los dos: nunca desaparece del todo.
    expect(momentosDe({ atemporal: false, momentos: [] })).toEqual(['DIA', 'NOCHE']);
  });

  it('de noche no se ofrece la oficina', () => {
    expect(contextosDelMomento(CONTEXTOS, 'NOCHE').map((c) => c.id)).toEqual(['gimnasio', 'cita']);
    expect(contextosDelMomento(CONTEXTOS, 'DIA').map((c) => c.id)).toEqual([
      'oficina',
      'gimnasio',
      'cita',
    ]);
  });

  it('el habitual solo vale si existe en ese momento', () => {
    // Mejor uno con momento que el gimnasio, donde no se podria volver al dia.
    expect(contextoParaMomento(CONTEXTOS, 'NOCHE', 'oficina')?.id).toBe('cita');
    expect(contextoParaMomento([GIMNASIO].map((c) => ({ ...c, momentos: [...c.momentos] })), 'NOCHE', null)?.id).toBe('gimnasio');
    expect(contextoParaMomento(CONTEXTOS, 'NOCHE', 'cita')?.id).toBe('cita');
    expect(contextoParaMomento(CONTEXTOS, 'DIA', null)?.id).toBe('oficina');
    expect(contextoParaMomento([], 'DIA', null)).toBeNull();
  });

  it('solo lista los contextos a los que les falta un momento', () => {
    expect(momentosPorContexto(CONTEXTOS)).toEqual({ oficina: ['DIA'] });
  });

  it('los huecos de la oficina de noche no existen', () => {
    const { totalCombinaciones, huecos } = detectarHuecos(
      [],
      ['oficina', 'cita', 'gimnasio'],
      ['gimnasio'],
      momentosPorContexto(CONTEXTOS),
    );
    expect(totalCombinaciones).toBe(4 + 8 + 1);
    expect(huecos.some((h) => h.contextoId === 'oficina' && h.momento === 'NOCHE')).toBe(false);
  });
});

describe('parte de los usos en cada momento', () => {
  it('reparte por el % de noche solo si existe en los dos', () => {
    const cita = { ...CITA, momentos: [...CITA.momentos], pctNoche: 80 };
    expect(fraccionDelMomento(cita, 'NOCHE')).toBeCloseTo(0.8);
    expect(fraccionDelMomento(cita, 'DIA')).toBeCloseTo(0.2);
    const oficina = { ...OFICINA, momentos: [...OFICINA.momentos], pctNoche: 50 };
    expect(fraccionDelMomento(oficina, 'DIA')).toBe(1);
    expect(fraccionDelMomento(oficina, 'NOCHE')).toBe(0);
    expect(fraccionDelMomento({ ...GIMNASIO, momentos: [], pctNoche: 50 }, 'NOCHE')).toBe(1);
  });
});

describe('frecuencia real', () => {
  it('ocasiones por semana y parte de noche en 90 días', () => {
    const real = frecuenciaReal(
      [
        { contextoId: 'oficina', ocasiones: 52, noches: 0 },
        { contextoId: 'cita', ocasiones: 13, noches: 12 },
      ],
      400,
    );
    // 90 dias son 12,86 semanas.
    expect(real.get('oficina')).toEqual({ usosSemana: 4, pctNoche: 0 });
    expect(real.get('cita')).toEqual({ usosSemana: 1, pctNoche: 92 });
  });

  it('con poco historial divide entre los días que hay', () => {
    const real = frecuenciaReal([{ contextoId: 'oficina', ocasiones: 10, noches: 0 }], 14);
    expect(real.get('oficina')?.usosSemana).toBe(5);
  });

  it('sin historial no hay frecuencia', () => {
    expect(frecuenciaReal([], 0).size).toBe(0);
  });
});

describe('leer el formulario de un contexto', () => {
  it('admite coma decimal y vacío', () => {
    expect(leerAjusteContexto({ momentos: ['DIA', 'NOCHE'], usosSemana: '0,5', pctNoche: '80' })).toEqual({
      ok: true,
      ajuste: { momentos: ['DIA', 'NOCHE'], usosSemana: 0.5, pctNoche: 80 },
    });
    expect(leerAjusteContexto({ momentos: ['DIA'], usosSemana: '', pctNoche: '50' })).toEqual({
      ok: true,
      ajuste: { momentos: ['DIA'], usosSemana: null, pctNoche: 50 },
    });
  });

  it('sin momentos o fuera de rango no vale', () => {
    expect(leerAjusteContexto({ momentos: [], usosSemana: '5', pctNoche: '50' }).ok).toBe(false);
    expect(leerAjusteContexto({ momentos: ['DIA'], usosSemana: '15', pctNoche: '50' }).ok).toBe(false);
    expect(leerAjusteContexto({ momentos: ['DIA'], usosSemana: 'mucho', pctNoche: '50' }).ok).toBe(false);
    expect(leerAjusteContexto({ momentos: ['DIA'], usosSemana: '5', pctNoche: '120' }).ok).toBe(false);
  });
});
