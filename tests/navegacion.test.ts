/**
 * El destino de vuelta del login sale de la query, asi que lo controla quien
 * escriba el enlace. Estos casos son los que convierten un login en un
 * redirector abierto si se dejan pasar.
 */
import { describe, expect, it } from 'vitest';
import { destinoSeguro, esFechaIso, esUuid, fechaOVacia, uuidOVacio } from '@/dominio/navegacion';

describe('destinos de vuelta tras el login', () => {
  it.each([
    ['/', '/'],
    ['/coleccion', '/coleccion'],
    ['/compartir?url=https%3A%2F%2Fwww.fragrantica.es%2Fperfume%2FA%2FB-1.html',
     '/compartir?url=https%3A%2F%2Fwww.fragrantica.es%2Fperfume%2FA%2FB-1.html'],
  ])('deja pasar %s', (entrada, esperado) => {
    expect(destinoSeguro(entrada)).toBe(esperado);
  });

  it.each([
    ['https://sitio-falso.example/roba', 'URL absoluta'],
    ['http://sitio-falso.example', 'URL absoluta sin TLS'],
    ['//sitio-falso.example/roba', 'protocolo heredado'],
    ['/\\sitio-falso.example', 'barra invertida, que algunos navegadores tratan como //'],
    ['javascript:alert(1)', 'pseudo-protocolo'],
    ['data:text/html,<script>', 'data:'],
    ['/algo\r\nLocation: https://sitio-falso.example', 'inyeccion de cabecera'],
    ['/\t/sitio-falso.example', 'tabulador, que el navegador quita y deja //'],
    ['/\u0000/sitio-falso.example', 'caracter de control'],
    ['   ', 'solo espacios'],
    ['', 'vacio'],
  ])('manda al inicio %s (%s)', (entrada) => {
    expect(destinoSeguro(entrada)).toBe('/');
  });

  it.each([[null], [undefined], [42], [{}], [['/coleccion']]])(
    'manda al inicio lo que no es texto: %s',
    (entrada) => {
      expect(destinoSeguro(entrada)).toBe('/');
    },
  );
});

describe('ids y fechas que llegan por la URL', () => {
  it('solo pasan UUIDs de verdad', () => {
    expect(esUuid('94638098-cb12-4971-89c1-28d57cd044b2')).toBe(true);
    expect(esUuid('no-es-un-id')).toBe(false);
    expect(esUuid("1' OR '1'='1")).toBe(false);
    expect(uuidOVacio(undefined)).toBeUndefined();
  });

  it('solo pasan fechas que existen', () => {
    expect(esFechaIso('2026-10-02')).toBe(true);
    expect(esFechaIso('2026-02-30')).toBe(false);
    expect(esFechaIso('2026-13-01')).toBe(false);
    expect(esFechaIso('mañana')).toBe(false);
    expect(fechaOVacia('2024-02-29')).toBe('2024-02-29');
  });
});
