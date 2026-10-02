import { describe, expect, it } from 'vitest';
import { elegirZona, fechaEnZona, zonaValida, ZONA_POR_DEFECTO } from '@/dominio/zona';

describe('zona horaria del usuario', () => {
  it('acepta nombres IANA y rechaza lo demás', () => {
    expect(zonaValida('America/Mexico_City')).toBe('America/Mexico_City');
    expect(zonaValida('Marte/Olympus')).toBeNull();
    expect(zonaValida('')).toBeNull();
    expect(zonaValida(undefined)).toBeNull();
  });

  it('se queda con la primera válida, y si no hay ninguna con la de la app', () => {
    expect(elegirZona('basura', 'Atlantic/Canary')).toBe('Atlantic/Canary');
    expect(elegirZona(null, undefined)).toBe(ZONA_POR_DEFECTO);
  });

  it('a las 23:30 UTC ya es mañana en Madrid y todavía hoy en Canarias y México', () => {
    const ahora = new Date('2026-10-02T23:30:00Z');
    expect(fechaEnZona('Europe/Madrid', ahora)).toBe('2026-10-03');
    expect(fechaEnZona('Atlantic/Canary', ahora)).toBe('2026-10-03');
    expect(fechaEnZona('America/Mexico_City', ahora)).toBe('2026-10-02');
  });
});
