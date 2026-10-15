import { describe, expect, it } from 'vitest';
import { diasDesdeCopia, textoUltimaCopia, tocaCopia } from '@/dominio/copias';

describe('recordatorio de copias', () => {
  const ahora = new Date('2026-10-15T10:00:00Z');

  it('cuenta los días desde la última', () => {
    expect(diasDesdeCopia('2026-10-15T08:00:00Z', ahora)).toBe(0);
    expect(diasDesdeCopia('2026-10-14T09:00:00Z', ahora)).toBe(1);
    expect(diasDesdeCopia('2026-09-01T10:00:00Z', ahora)).toBe(44);
    expect(diasDesdeCopia(null, ahora)).toBeNull();
    expect(diasDesdeCopia('no es una fecha', ahora)).toBeNull();
  });

  it('avisa a los 30 días o si nunca se ha hecho', () => {
    expect(tocaCopia(null)).toBe(true);
    expect(tocaCopia(29)).toBe(false);
    expect(tocaCopia(30)).toBe(true);
  });

  it('lo dice en palabras', () => {
    expect(textoUltimaCopia(null)).toMatch(/Todavía no/);
    expect(textoUltimaCopia(0)).toBe('Última copia completa: hoy.');
    expect(textoUltimaCopia(12)).toBe('Última copia completa: hace 12 días.');
  });
});
