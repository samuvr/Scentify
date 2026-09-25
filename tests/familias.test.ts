/**
 * Familias marcadas a partir de los acordes de Fragrantica.
 *
 * Las familias se leen de las propias migraciones y los acordes de las fichas
 * reales de `tests/fixtures/`: si alguien cambia un slug o Fragrantica cambia
 * como escribe un acorde, el test lo dice.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { familiasDeAcordes, type FamiliaConocida } from '@/dominio/familias';
import { leerFichaFragrantica } from '@/dominio/fragrantica';

function familiasSembradas(): FamiliaConocida[] {
  return ['drizzle/0001_semillas.sql', 'drizzle/0004_familias_frescas.sql'].flatMap((fichero) => {
    const sql = readFileSync(fichero, 'utf8');
    const inicio = sql.indexOf('INSERT INTO "familia"');
    const bloque = sql.slice(inicio, sql.indexOf('ON CONFLICT', inicio));
    return [...bloque.matchAll(/\('([a-z-]+)',\s*'([^']+)'\)/g)].map(([, slug, nombre]) => ({
      id: slug!,
      slug: slug!,
      nombre: nombre!,
    }));
  });
}

const FAMILIAS = familiasSembradas();
const acordesDe = (fixture: string) =>
  leerFichaFragrantica(readFileSync(`tests/fixtures/${fixture}`, 'utf8')).acordes;

describe('familias a partir de los acordes', () => {
  it('las semillas incluyen Fresco, Fresco especiado y Cálido especiado', () => {
    const nombres = FAMILIAS.map((f) => f.nombre);
    expect(nombres).toEqual(expect.arrayContaining(['Fresco', 'Fresco especiado', 'Cálido especiado']));
    expect(new Set(FAMILIAS.map((f) => f.slug)).size).toBe(FAMILIAS.length);
  });

  it('marca las familias de una ficha real, en el orden de los acordes', () => {
    // ámbar, aromático, cítrico, fresco especiado, almizclado, amaderado,
    // lavanda, especiado suave, cálido especiado, herbal
    expect(familiasDeAcordes(acordesDe('fragrantica-popular.html'), FAMILIAS)).toEqual([
      'ambar',
      'aromatico',
      'citrico',
      'fresco-especiado',
      'almizclado',
      'amaderado',
      'especiado',
      'calido-especiado',
    ]);
  });

  it('entiende los plurales de Fragrantica', () => {
    // florales, almizclado, atalcado, violeta, amaderado, afrutados, cítrico,
    // ámbar, dulce, animálico
    expect(familiasDeAcordes(acordesDe('fragrantica-nicho.html'), FAMILIAS)).toEqual([
      'floral',
      'almizclado',
      'atalcado',
      'amaderado',
      'afrutado',
      'citrico',
      'ambar',
      'dulce',
    ]);
  });

  it('«Fresco» a secas es su propia familia', () => {
    expect(familiasDeAcordes(acordesDe('fragrantica-pegado-ruidoso.txt'), FAMILIAS)).toContain(
      'fresco',
    );
  });

  it('«cálido especiado» no marca además «Especiado»', () => {
    expect(familiasDeAcordes(['cálido especiado'], FAMILIAS)).toEqual(['calido-especiado']);
    expect(familiasDeAcordes(['fresco especiado'], FAMILIAS)).toEqual(['fresco-especiado']);
  });

  it('las familias con barra valen por cualquiera de sus nombres', () => {
    expect(familiasDeAcordes(['acuático', 'marino', 'ozónico', 'incienso'], FAMILIAS)).toEqual([
      'marino',
      'mineral',
      'resinoso',
    ]);
  });

  it('la ficha inglesa también', () => {
    expect(
      familiasDeAcordes(['woody', 'fresh spicy', 'warm spicy', 'citrus', 'musky'], FAMILIAS),
    ).toEqual(['amaderado', 'fresco-especiado', 'calido-especiado', 'citrico', 'almizclado']);
  });

  it('lo que no tiene familia se queda fuera, sin inventar', () => {
    expect(familiasDeAcordes(['lavanda', 'herbal', 'violeta', 'animálico'], FAMILIAS)).toEqual([]);
  });
});
