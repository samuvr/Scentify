import { describe, expect, it } from 'vitest';
import { sentidoPorDefecto } from '@/dominio/orden-coleccion';

describe('sentidoPorDefecto', () => {
  it('ordena nombre y marca de la A a la Z', () => {
    expect(sentidoPorDefecto('nombre')).toBe('asc');
    expect(sentidoPorDefecto('marca')).toBe('asc');
    expect(sentidoPorDefecto()).toBe('asc');
  });

  it('pone primero lo más reciente y lo más usado', () => {
    expect(sentidoPorDefecto('ultimo-uso')).toBe('desc');
    expect(sentidoPorDefecto('mas-usado')).toBe('desc');
  });
});
