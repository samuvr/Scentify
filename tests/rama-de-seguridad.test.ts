import { describe, expect, it } from 'vitest';
import { migracionesPendientes, nombreDeRama, ramasQueSobran } from '@/db/rama-de-seguridad';

describe('copia antes de migrar', () => {
  const diario = [
    { tag: '0004_familias', when: 100 },
    { tag: '0005_ubicacion', when: 200 },
    { tag: '0006_temperatura', when: 300 },
  ];

  it('sabe qué migraciones faltan', () => {
    expect(migracionesPendientes(diario, 200)).toEqual(['0006_temperatura']);
    expect(migracionesPendientes(diario, 300)).toEqual([]);
    expect(migracionesPendientes(diario, null)).toHaveLength(3);
  });

  it('nombra la rama con la migración y la fecha', () => {
    expect(nombreDeRama(['0006_temperatura'], new Date('2026-10-15T12:34:00Z'))).toBe(
      'antes-de-0006_temperatura-202610151234',
    );
  });

  it('conserva solo las tres últimas ramas de seguridad', () => {
    const ramas = [
      { id: 'main', name: 'main', created_at: '2026-01-01' },
      { id: 'a', name: 'antes-de-1', created_at: '2026-02-01' },
      { id: 'b', name: 'antes-de-2', created_at: '2026-03-01' },
      { id: 'c', name: 'antes-de-3', created_at: '2026-04-01' },
      { id: 'd', name: 'antes-de-4', created_at: '2026-05-01' },
    ];
    expect(ramasQueSobran(ramas)).toEqual(['a']);
    expect(ramasQueSobran(ramas.slice(0, 3))).toEqual([]);
  });
});
