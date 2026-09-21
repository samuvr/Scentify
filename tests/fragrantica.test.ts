/**
 * Seccion 5 — Parser de fichas de Fragrantica.
 *
 * Las fichas de prueba son sinteticas y no tocan la red: la especificacion
 * prohibe la recoleccion automatizada. Lo que se fija aqui es el
 * comportamiento del parser ante las dos maquetaciones que pide la 5.3, una
 * muy votada y otra de nicho con pocos datos.
 */
import { describe, expect, it } from 'vitest';
import { esUrlDeFichaValida, leerFichaFragrantica } from '@/dominio/fragrantica';
import {
  FICHA_DE_NICHO,
  FICHA_MUY_VOTADA,
  PAGINA_SIN_DATOS,
  TEXTO_PEGADO,
} from './fixtures/fragrantica';

describe('ficha muy votada: hay número visible y anchura de barra', () => {
  const ficha = leerFichaFragrantica(FICHA_MUY_VOTADA);

  it('extrae las cuatro estaciones', () => {
    expect(ficha.estaciones).not.toBeNull();
    expect(Object.keys(ficha.estaciones ?? {}).sort()).toEqual([
      'INVIERNO',
      'OTONO',
      'PRIMAVERA',
      'VERANO',
    ]);
  });

  it('se queda con el recuento de votos cuando está, y guarda también la anchura', () => {
    expect(ficha.estaciones?.INVIERNO.votos).toBe(268);
    expect(ficha.estaciones?.INVIERNO.anchura).toBeCloseTo(92.4138, 3);
  });

  it('normaliza los votos a porcentaje sobre el total del eje', () => {
    // 268 + 119 + 42 + 228 = 657
    expect(ficha.estaciones?.INVIERNO.pct).toBe(41); // 268/657
    expect(ficha.estaciones?.PRIMAVERA.pct).toBe(18);
    expect(ficha.estaciones?.VERANO.pct).toBe(6);
    expect(ficha.estaciones?.OTONO.pct).toBe(35);
  });

  it('cada eje se normaliza sobre su propio total, no sobre el conjunto', () => {
    const suma = (o: Record<string, { pct: number }> | null) =>
      Object.values(o ?? {}).reduce((s, v) => s + v.pct, 0);
    expect(suma(ficha.estaciones)).toBeGreaterThanOrEqual(99);
    expect(suma(ficha.estaciones)).toBeLessThanOrEqual(101);
    expect(suma(ficha.momentos)).toBeGreaterThanOrEqual(99);
    expect(suma(ficha.momentos)).toBeLessThanOrEqual(101);
  });

  it('extrae el eje día/noche', () => {
    expect(ficha.momentos?.DIA.votos).toBe(96);
    expect(ficha.momentos?.NOCHE.votos).toBe(252);
    expect(ficha.momentos?.NOCHE.pct).toBe(72); // 252/348
  });

  it('extrae la pirámide en sus tres niveles', () => {
    expect(ficha.notas.salida).toEqual(['Cinnamon', 'Nutmeg', 'Bergamot']);
    expect(ficha.notas.corazon).toEqual(['Dates', 'Praline', 'Tuberose']);
    expect(ficha.notas.fondo).toEqual(['Vanilla', 'Tonka Bean', 'Benzoin', 'Myrrh']);
  });

  it('extrae marca, año y acordes principales', () => {
    expect(ficha.marca).toBe('Lattafa Perfumes');
    expect(ficha.anio).toBe(2022);
    expect(ficha.acordes).toEqual(['warm spicy', 'cinnamon', 'woody']);
  });
});

describe('ficha de nicho: solo hay barras, sin número visible', () => {
  const ficha = leerFichaFragrantica(FICHA_DE_NICHO);

  it('se apaña con la anchura cuando no hay votos', () => {
    expect(ficha.estaciones?.INVIERNO.votos).toBeNull();
    expect(ficha.estaciones?.INVIERNO.anchura).toBe(100);
  });

  it('normaliza sobre las anchuras', () => {
    // 100 + 25 + 0 + 75 = 200
    expect(ficha.estaciones?.INVIERNO.pct).toBe(50);
    expect(ficha.estaciones?.PRIMAVERA.pct).toBe(13);
    expect(ficha.estaciones?.VERANO.pct).toBe(0);
    expect(ficha.estaciones?.OTONO.pct).toBe(38);
  });

  it('un nivel de la pirámide que no existe queda vacío, no inventado', () => {
    expect(ficha.notas.salida).toEqual(['Saffron']);
    expect(ficha.notas.corazon).toEqual([]);
    expect(ficha.notas.fondo).toEqual(['Agarwood (Oud)', 'Sandalwood']);
  });

  it('sin acordes marcados devuelve lista vacía', () => {
    expect(ficha.acordes).toEqual([]);
  });
});

describe('fallback 1 de la 5.2: texto pegado del navegador', () => {
  const ficha = leerFichaFragrantica(TEXTO_PEGADO);

  it('lee los mismos ejes con las mismas reglas, sin una etiqueta HTML', () => {
    expect(ficha.estaciones?.INVIERNO.votos).toBe(268);
    expect(ficha.estaciones?.OTONO.votos).toBe(228);
    expect(ficha.momentos?.NOCHE.votos).toBe(252);
  });

  it('normaliza igual que desde el HTML', () => {
    expect(ficha.estaciones?.INVIERNO.pct).toBe(41);
    expect(ficha.momentos?.NOCHE.pct).toBe(72);
  });
});

describe('cuando no hay datos, no se inventa ninguno', () => {
  it('una página de Cloudflare no produce votos', () => {
    const ficha = leerFichaFragrantica(PAGINA_SIN_DATOS);
    expect(ficha.estaciones).toBeNull();
    expect(ficha.momentos).toBeNull();
    expect(ficha.notas).toEqual({ salida: [], corazon: [], fondo: [] });
  });

  it('una cadena vacía no revienta', () => {
    const ficha = leerFichaFragrantica('');
    expect(ficha.estaciones).toBeNull();
    expect(ficha.acordes).toEqual([]);
    expect(ficha.anio).toBeNull();
  });

  it('no confunde una etiqueta dentro de otra palabra', () => {
    // "Monday" contiene "day"; "everyday" también. Ninguna es el eje día/noche.
    const ficha = leerFichaFragrantica('<p>Perfect for Monday and everyday wear</p>');
    expect(ficha.momentos).toBeNull();
  });
});

describe('solo se aceptan URLs de ficha', () => {
  it.each([
    ['https://www.fragrantica.com/perfume/Lattafa/Khamrah-77777.html', true],
    ['https://www.fragrantica.es/perfume/Asdaaf/Oud-1234.html', true],
    ['https://www.fragrantica.com/news/algo.html', false],
    ['https://www.fragrantica.com/', false],
    ['http://www.fragrantica.com/perfume/x/y.html', false],
    ['https://fragrantica.com.ataque.example/perfume/x.html', false],
    ['no es una url', false],
  ])('%s -> %s', (url, valida) => {
    expect(esUrlDeFichaValida(url)).toBe(valida);
  });
});
