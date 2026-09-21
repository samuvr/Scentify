/**
 * Seccion 5 — Parser de fichas de Fragrantica.
 *
 * Las dos fichas de `tests/fixtures/` son fragmentos REALES de fragrantica.es,
 * recortados a los bloques que el parser mira. Una es un superventas con miles
 * de votos y la otra una novedad con pocos: la 5.3 pide probar las dos porque
 * el bloque se renderiza distinto.
 *
 * Los tests no tocan la red: leen los ficheros del repositorio.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { esUrlDeFichaValida, leerFichaFragrantica } from '@/dominio/fragrantica';
import { FICHA_EN_INGLES, PAGINA_SIN_DATOS, TEXTO_PEGADO } from './fixtures/fragrantica';

const fixture = (nombre: string) =>
  readFileSync(new URL(`./fixtures/fragrantica-${nombre}.html`, import.meta.url), 'utf8');

/* --------------------------------------- ficha muy votada (superventas) */

describe('Club De Nuit Urban Elixir: miles de votos', () => {
  const ficha = leerFichaFragrantica(fixture('popular'));

  it('lee marca y año', () => {
    expect(ficha.marca).toBe('Armaf');
    // La ficha española dice "se lanzó en 2022", no "launched in".
    expect(ficha.anio).toBe(2022);
  });

  it('lee los diez acordes sin arrastrar el enlace que va debajo', () => {
    // Fragrantica cierra la lista con un enlace "Buscar por acordes" que no es
    // un acorde, y que se colaba como si lo fuera.
    expect(ficha.acordes).toEqual([
      'ámbar',
      'aromático',
      'cítrico',
      'fresco especiado',
      'almizclado',
      'amaderado',
      'lavanda',
      'especiado suave',
      'cálido especiado',
      'herbal',
    ]);
  });

  it('lee la pirámide completa, con los tres niveles', () => {
    expect(ficha.notas.salida).toEqual([
      'bergamota',
      'pimienta rosa',
      'jazmín',
      'flor de azahar del naranjo',
    ]);
    expect(ficha.notas.corazon).toEqual([
      'lavanda',
      'elemí',
      'geranio',
      'vetiver',
      'azafrán',
      // Con paréntesis y coma dentro: no se parte en dos notas.
      'cempasúchil (tagete, clavelón)',
    ]);
    expect(ficha.notas.fondo).toEqual(['ambroxan', 'ámbar', 'cedro', 'pachulí', 'ládano']);
  });

  it('entiende los recuentos abreviados: "2.8k" son 2800 votos', () => {
    expect(ficha.estaciones?.OTONO.votos).toBe(2800);
    expect(ficha.estaciones?.INVIERNO.votos).toBe(2300);
    expect(ficha.momentos?.DIA.votos).toBe(2800);
  });

  it('extrae también la anchura de la barra, no solo el número', () => {
    expect(ficha.estaciones?.PRIMAVERA.anchura).toBeCloseTo(100, 1);
    expect(ficha.estaciones?.OTONO.anchura).toBeCloseTo(96.4608, 3);
  });

  it('normaliza cada eje sobre su propio total', () => {
    const suma = (o: Record<string, { pct: number }> | null) =>
      Object.values(o ?? {}).reduce((s, v) => s + v.pct, 0);
    expect(suma(ficha.estaciones)).toBeGreaterThanOrEqual(99);
    expect(suma(ficha.estaciones)).toBeLessThanOrEqual(101);
    expect(suma(ficha.momentos)).toBe(100);
  });

  it('un superventas está repartido entre las cuatro estaciones', () => {
    // Es lo que hace útil ver los votos al categorizar: aquí no ayudan mucho,
    // y precisamente por eso manda lo que marque yo.
    const pcts = Object.values(ficha.estaciones ?? {}).map((v) => v.pct);
    expect(Math.max(...pcts) - Math.min(...pcts)).toBeLessThan(15);
  });
});

/* ------------------------------------------ ficha nueva con pocos votos */

describe('Nava Sol: novedad con pocos votos', () => {
  const ficha = leerFichaFragrantica(fixture('nicho'));

  it('lee marca y año', () => {
    expect(ficha.marca).toBe('Rayhaan');
    expect(ficha.anio).toBe(2026);
  });

  it('con pocos votos el número va sin abreviar', () => {
    expect(ficha.estaciones?.PRIMAVERA.votos).toBe(151);
    expect(ficha.estaciones?.INVIERNO.votos).toBe(85);
    expect(ficha.momentos?.NOCHE.votos).toBe(90);
  });

  it('lee la pirámide aunque tenga pocas notas por nivel', () => {
    expect(ficha.notas.salida).toEqual(['chicozapote', 'almizcle ambreta']);
    expect(ficha.notas.corazon).toEqual(['magnolia', 'violeta', 'sándalo']);
    expect(ficha.notas.fondo).toEqual(['almizcle', 'ámbar gris', 'cedro']);
  });

  it('lee los acordes', () => {
    expect(ficha.acordes).toEqual([
      'florales',
      'almizclado',
      'atalcado',
      'violeta',
      'amaderado',
      'afrutados',
      'cítrico',
      'ámbar',
      'dulce',
      'animálico',
    ]);
  });

  it('normaliza igual que la ficha muy votada', () => {
    const suma = Object.values(ficha.estaciones ?? {}).reduce((s, v) => s + v.pct, 0);
    expect(suma).toBe(100);
  });
});

/* ----------------------------------------------- otras maquetaciones */

describe('ficha en inglés (fragrantica.com)', () => {
  const ficha = leerFichaFragrantica(FICHA_EN_INGLES);

  it('reconoce los rótulos en inglés', () => {
    expect(ficha.estaciones?.INVIERNO.votos).toBe(268);
    expect(ficha.momentos?.NOCHE.votos).toBe(252);
    expect(ficha.notas.salida).toEqual(['Cinnamon', 'Nutmeg', 'Bergamot']);
    expect(ficha.notas.fondo).toEqual(['Vanilla', 'Tonka Bean', 'Benzoin', 'Myrrh']);
  });

  it('normaliza los votos sobre el total del eje', () => {
    // 268 + 119 + 42 + 228 = 657
    expect(ficha.estaciones?.INVIERNO.pct).toBe(41);
    expect(ficha.estaciones?.VERANO.pct).toBe(6);
  });
});

describe('fallback 1 de la 5.2: texto pegado del navegador', () => {
  const ficha = leerFichaFragrantica(TEXTO_PEGADO);

  it('lee los ejes sin una sola etiqueta HTML', () => {
    expect(ficha.estaciones?.INVIERNO.votos).toBe(268);
    expect(ficha.momentos?.NOCHE.votos).toBe(252);
    expect(ficha.estaciones?.INVIERNO.pct).toBe(41);
  });

  it('lee la pirámide de la frase en prosa del resumen', () => {
    expect(ficha.notas.salida).toEqual(['bergamota', 'pimienta rosa', 'jazmín']);
    expect(ficha.notas.fondo).toEqual(['ámbar', 'cedro', 'ládano']);
  });
});

/* ------------------------------------------------- cuando no hay datos */

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
    // "Monday" contiene "day"; "everyday" también.
    const ficha = leerFichaFragrantica('<p>Perfect for Monday and everyday wear</p>');
    expect(ficha.momentos).toBeNull();
  });

  it('no toma por votos los números que hay sueltos en el marcado', () => {
    // Clases como `small-9` y colores como `#cc9966` están llenos de dígitos.
    const ficha = leerFichaFragrantica(
      '<div class="cell small-9"><span>invierno</span>' +
        '<div style="width: 50%; background: #cc9966;"></div></div>',
    );
    expect(ficha.estaciones?.INVIERNO.votos).toBeNull();
    expect(ficha.estaciones?.INVIERNO.anchura).toBe(50);
  });
});

/* ------------------------------------------- la seleccion que dice la app */

/**
 * La pantalla le pide al usuario que seleccione desde «acordes principales»
 * hasta justo antes de «Votar por ingredientes». Este fixture es exactamente
 * ese tramo, sacado del innerText real de la ficha renderizada en un navegador,
 * no escrito a mano. Si el parser deja de entenderlo, la instruccion que da la
 * interfaz pasa a ser mentira, y este test es lo que lo impide.
 */
describe('el tramo que la interfaz manda seleccionar se lee entero', () => {
  const pegado = readFileSync(
    new URL('./fixtures/fragrantica-seleccion-recomendada.txt', import.meta.url),
    'utf8',
  );

  it('saca los diez acordes', () => {
    const ficha = leerFichaFragrantica(pegado);
    expect(ficha.acordes).toHaveLength(10);
    expect(ficha.acordes[0]).toBe('ámbar');
    expect(ficha.acordes.at(-1)).toBe('herbal');
  });

  it('saca los tres niveles de la pirámide', () => {
    const ficha = leerFichaFragrantica(pegado);
    expect(ficha.notas.salida).toEqual([
      'bergamota',
      'pimienta rosa',
      'jazmín',
      'flor de azahar del naranjo',
    ]);
    expect(ficha.notas.corazon).toContain('elemí');
    expect(ficha.notas.fondo).toEqual(['ambroxan', 'ámbar', 'cedro', 'pachulí', 'ládano']);
  });

  it('saca los votos de estación y momento', () => {
    const ficha = leerFichaFragrantica(pegado);
    expect(ficha.estaciones).not.toBeNull();
    expect(ficha.momentos).not.toBeNull();
    // Los mismos porcentajes que da la lectura automatica del HTML completo:
    // acotar la seleccion no cambia el resultado.
    expect(ficha.estaciones?.PRIMAVERA.pct).toBe(27);
    expect(ficha.momentos?.DIA.pct).toBe(51);
  });
});

/* ---------------------------------------------------- validacion de URL */

describe('solo se aceptan URLs de ficha', () => {
  it.each([
    ['https://www.fragrantica.com/perfume/Lattafa/Khamrah-77777.html', true],
    ['https://www.fragrantica.es/perfume/Armaf/Club-De-Nuit-Urban-Elixir-77860.html', true],
    ['https://www.fragrantica.com/news/algo.html', false],
    ['https://www.fragrantica.com/', false],
    ['http://www.fragrantica.com/perfume/x/y.html', false],
    ['https://fragrantica.com.ataque.example/perfume/x.html', false],
    ['no es una url', false],
  ])('%s -> %s', (url, valida) => {
    expect(esUrlDeFichaValida(url)).toBe(valida);
  });
});
