import { describe, expect, it } from 'vitest';
import { claveBusqueda, coincideBusqueda, palabrasDeBusqueda } from '@/dominio/texto';

describe('busqueda por palabras sueltas', () => {
  const khamrah = claveBusqueda('Khamrah', 'Lattafa');
  const clubDeNuit = claveBusqueda('Club de Nuit Intense Man', 'Armaf');
  const nuevePm = claveBusqueda('9PM', 'Afnan');

  it('encuentra con las palabras en cualquier orden', () => {
    expect(coincideBusqueda(khamrah, 'lattafa khamrah')).toBe(true);
    expect(coincideBusqueda(khamrah, 'Khamrah Lattafa')).toBe(true);
  });

  it('no exige que las palabras vayan seguidas', () => {
    expect(coincideBusqueda(clubDeNuit, 'club nuit')).toBe(true);
    expect(coincideBusqueda(clubDeNuit, 'armaf intense')).toBe(true);
  });

  it('«9 pm» y «9pm» encuentran «9PM»', () => {
    expect(coincideBusqueda(nuevePm, '9 pm')).toBe(true);
    expect(coincideBusqueda(nuevePm, '9pm')).toBe(true);
  });

  it('todas las palabras tienen que estar', () => {
    expect(coincideBusqueda(khamrah, 'khamrah armaf')).toBe(false);
    expect(coincideBusqueda(khamrah, '   ')).toBe(false);
  });

  it('ignora mayúsculas y acentos', () => {
    expect(palabrasDeBusqueda('  Ámbar   OUD ')).toEqual(['ambar', 'oud']);
    expect(coincideBusqueda(claveBusqueda('Amber Oud', 'Al Haramain'), 'ÁMBER')).toBe(true);
    expect(coincideBusqueda(claveBusqueda('Ámbar Oud', 'X'), 'ambar')).toBe(true);
  });
});
