/**
 * Seccion 6.2 — Calculo de idoneidad.
 *
 * Tres ejes, cada uno vale un tercio:
 *   momento_ok  = momento elegido pertenece a los momentos marcados del perfume
 *   contexto_ok = contexto elegido pertenece a los contextos del perfume
 *   estacion_ok = alguna estacion marcada del perfume pertenece a las compatibles de hoy
 *   idoneidad   = round(100 * aciertos / 3)
 */
import { describe, expect, it } from 'vitest';
import { calcularIdoneidad } from '@/dominio/idoneidad';
import type { CondicionesUso, Estacion, PerfumeIdoneidad } from '@/dominio/tipos';

const OFICINA = 'ctx-oficina';
const GIMNASIO = 'ctx-gimnasio';

/** Perfume de referencia: noche, oficina, otoño e invierno. */
const khamrah: PerfumeIdoneidad = {
  momentos: ['NOCHE'],
  contextos: [OFICINA],
  estaciones: ['OTONO', 'INVIERNO'],
};

const condiciones = (parcial: Partial<CondicionesUso> = {}): CondicionesUso => ({
  momento: 'NOCHE',
  contextoId: OFICINA,
  estacionesCompatibles: ['OTONO'],
  ...parcial,
});

describe('los tres ejes, por separado', () => {
  it('acierta el momento cuando el elegido esta entre los marcados', () => {
    const perfume: PerfumeIdoneidad = { ...khamrah, momentos: ['DIA', 'NOCHE'] };
    expect(calcularIdoneidad(perfume, condiciones({ momento: 'DIA' })).detalle.momento).toBe(true);
    expect(calcularIdoneidad(perfume, condiciones({ momento: 'NOCHE' })).detalle.momento).toBe(true);
  });

  it('falla el momento cuando el perfume solo esta marcado para el contrario', () => {
    expect(calcularIdoneidad(khamrah, condiciones({ momento: 'DIA' })).detalle.momento).toBe(false);
  });

  it('acierta el contexto solo si el elegido es uno de los del perfume', () => {
    expect(calcularIdoneidad(khamrah, condiciones()).detalle.contexto).toBe(true);
    expect(calcularIdoneidad(khamrah, condiciones({ contextoId: GIMNASIO })).detalle.contexto).toBe(
      false,
    );
  });

  it('acierta la estacion si CUALQUIERA de las marcadas esta entre las compatibles', () => {
    // El perfume es de otoño e invierno; hoy son compatibles verano y otoño.
    // Basta con que se solapen en una.
    const resultado = calcularIdoneidad(
      khamrah,
      condiciones({ estacionesCompatibles: ['VERANO', 'OTONO'] }),
    );
    expect(resultado.detalle.estacion).toBe(true);
  });

  it('falla la estacion cuando no hay ninguna interseccion', () => {
    const resultado = calcularIdoneidad(
      khamrah,
      condiciones({ estacionesCompatibles: ['VERANO', 'PRIMAVERA'] }),
    );
    expect(resultado.detalle.estacion).toBe(false);
  });
});

describe('el porcentaje es round(100 * aciertos / 3)', () => {
  it('tres aciertos dan 100, etiqueta Total y verde', () => {
    const resultado = calcularIdoneidad(khamrah, condiciones());
    expect(resultado.pct).toBe(100);
    expect(resultado.etiqueta).toBe('Total');
    expect(resultado.color).toBe('verde');
    expect(resultado.detalle).toEqual({ momento: true, contexto: true, estacion: true });
  });

  it('dos aciertos dan 67, etiqueta Alta y verde claro', () => {
    const resultado = calcularIdoneidad(khamrah, condiciones({ momento: 'DIA' }));
    expect(resultado.pct).toBe(67);
    expect(resultado.etiqueta).toBe('Alta');
    expect(resultado.color).toBe('verde-claro');
  });

  it('un acierto da 33, etiqueta Parcial y ambar', () => {
    const resultado = calcularIdoneidad(
      khamrah,
      condiciones({ momento: 'DIA', contextoId: GIMNASIO }),
    );
    expect(resultado.pct).toBe(33);
    expect(resultado.etiqueta).toBe('Parcial');
    expect(resultado.color).toBe('ambar');
  });

  it('cero aciertos dan 0, etiqueta Nula y rojo', () => {
    const resultado = calcularIdoneidad(
      khamrah,
      condiciones({ momento: 'DIA', contextoId: GIMNASIO, estacionesCompatibles: ['VERANO'] }),
    );
    expect(resultado.pct).toBe(0);
    expect(resultado.etiqueta).toBe('Nula');
    expect(resultado.color).toBe('rojo');
    expect(resultado.detalle).toEqual({ momento: false, contexto: false, estacion: false });
  });

  it('nunca devuelve un valor fuera de {0, 33, 67, 100}', () => {
    const combinaciones: CondicionesUso[] = [];
    for (const momento of ['DIA', 'NOCHE'] as const) {
      for (const contextoId of [OFICINA, GIMNASIO]) {
        for (const estacionesCompatibles of [
          ['OTONO'],
          ['VERANO'],
          ['VERANO', 'PRIMAVERA'],
        ] satisfies Estacion[][]) {
          combinaciones.push({ momento, contextoId, estacionesCompatibles });
        }
      }
    }
    for (const caso of combinaciones) {
      expect([0, 33, 67, 100]).toContain(calcularIdoneidad(khamrah, caso).pct);
    }
  });
});

describe('el desglose por eje se explica en texto, no solo el numero', () => {
  it('con los tres ejes bien, lo dice sin peros', () => {
    const { explicacion } = calcularIdoneidad(khamrah, condiciones());
    expect(explicacion).toBe('Encaja en momento, contexto y estación.');
  });

  it('reproduce el ejemplo de la especificacion cuando solo falla el momento', () => {
    // Perfume marcado solo para noche, registrado de dia.
    const { explicacion } = calcularIdoneidad(khamrah, condiciones({ momento: 'DIA' }));
    expect(explicacion).toBe(
      'Encaja en contexto y en estación, pero lo tienes marcado solo para noche.',
    );
  });

  it('nombra el eje que falla cuando es el contexto', () => {
    const { explicacion } = calcularIdoneidad(khamrah, condiciones({ contextoId: GIMNASIO }));
    expect(explicacion).toContain('contexto');
    expect(explicacion).toContain('no lo tienes marcado para este contexto');
  });

  it('nombra el eje que falla cuando es la estacion', () => {
    const { explicacion } = calcularIdoneidad(
      khamrah,
      condiciones({ estacionesCompatibles: ['VERANO'] }),
    );
    expect(explicacion).toContain('no lo tienes marcado para la estación de hoy');
  });

  it('cuando no encaja nada, lo dice sin fingir aciertos', () => {
    const { explicacion } = calcularIdoneidad(
      khamrah,
      condiciones({ momento: 'DIA', contextoId: GIMNASIO, estacionesCompatibles: ['VERANO'] }),
    );
    expect(explicacion).not.toContain('Encaja');
  });
});

describe('la idoneidad informa, nunca bloquea', () => {
  it('calcula un resultado valido incluso con idoneidad nula', () => {
    const resultado = calcularIdoneidad(
      khamrah,
      condiciones({ momento: 'DIA', contextoId: GIMNASIO, estacionesCompatibles: ['VERANO'] }),
    );
    // No lanza, no devuelve null: devuelve 0 con su desglose para poder guardarlo igual.
    expect(resultado.pct).toBe(0);
    expect(resultado.detalle).toBeDefined();
  });

  it('un perfume sin nada marcado da 0 en vez de reventar', () => {
    const vacio: PerfumeIdoneidad = { momentos: [], contextos: [], estaciones: [] };
    expect(calcularIdoneidad(vacio, condiciones()).pct).toBe(0);
  });

  it('un dia sin estaciones compatibles no acierta el eje de estacion', () => {
    const resultado = calcularIdoneidad(khamrah, condiciones({ estacionesCompatibles: [] }));
    expect(resultado.detalle.estacion).toBe(false);
    expect(resultado.pct).toBe(67);
  });
});

describe('el snapshot es inmune a cambios posteriores (criterio 10)', () => {
  it('recalcular con la configuracion nueva no toca el resultado ya calculado', () => {
    const antes = calcularIdoneidad(khamrah, condiciones());
    expect(antes.pct).toBe(100);

    // El usuario le quita el contexto Oficina al perfume, despues de haber registrado el uso.
    const despues: PerfumeIdoneidad = { ...khamrah, contextos: [GIMNASIO] };
    const recalculado = calcularIdoneidad(despues, condiciones());

    // La funcion es pura: el objeto anterior no se ha mutado. Quien persiste el
    // snapshot guarda `antes`, y nada de lo que pase luego lo cambia.
    expect(antes.pct).toBe(100);
    expect(antes.detalle.contexto).toBe(true);
    expect(recalculado.pct).toBe(67);
  });
});
