/**
 * El destino de vuelta del login sale de la query, asi que lo controla quien
 * escriba el enlace. Estos casos son los que convierten un login en un
 * redirector abierto si se dejan pasar.
 */
import { describe, expect, it } from 'vitest';
import { destinoSeguro } from '@/dominio/navegacion';

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
