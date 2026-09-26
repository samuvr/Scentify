/**
 * El boton «Enviar a Scentify». Se ejecuta el codigo del marcador de verdad,
 * con una pagina de mentira, para ver que lo que abre es lo que `/importar`
 * sabe leer.
 */
import { describe, expect, it, vi } from 'vitest';
import { codigoAtajo, codigoMarcador, leerFragmentoImportar, MAXIMO_TEXTO } from '@/dominio/importador';

const FICHA = 'https://www.fragrantica.es/perfume/Lattafa-Perfumes/Fakhar-Black-70465.html';

function pulsarMarcador(hostname: string, href: string, texto: string) {
  const abrir = vi.fn((_url: string) => ({}));
  const asignar = vi.fn((_url: string) => undefined);
  const avisar = vi.fn();
  const codigo = decodeURIComponent(codigoMarcador('https://scentify.example/').replace(/^javascript:/, ''));
  new Function('location', 'document', 'window', 'alert', codigo)(
    { hostname, href, assign: asignar },
    { body: { innerText: texto } },
    { open: abrir },
    avisar,
  );
  return { abrir, asignar, avisar };
}

describe('botón «Enviar a Scentify»', () => {
  it('abre /importar con la dirección y el texto de la ficha detrás del #', () => {
    const texto = 'Cuándo usarlo\ninvierno 1.2k & otoño + "comillas"';
    const { abrir, avisar } = pulsarMarcador('www.fragrantica.es', FICHA, texto);

    expect(avisar).not.toHaveBeenCalled();
    const abierta = String(abrir.mock.calls[0]![0]);
    expect(abierta.startsWith('https://scentify.example/importar#')).toBe(true);
    expect(leerFragmentoImportar(new URL(abierta).hash)).toEqual({ url: FICHA, texto });
  });

  it('si el navegador bloquea la pestaña nueva, abre en la misma', () => {
    const asignar = vi.fn((_url: string) => undefined);
    const codigo = codigoMarcador('https://scentify.example').replace(/^javascript:/, '');
    new Function('location', 'document', 'window', 'alert', codigo)(
      { hostname: 'www.fragrantica.com', href: FICHA, assign: asignar },
      { body: { innerText: 'x' } },
      { open: () => null },
      () => undefined,
    );
    expect(String(asignar.mock.calls[0]![0])).toMatch(/^https:\/\/scentify\.example\/importar#u=/);
  });

  it('fuera de Fragrantica avisa y no abre nada', () => {
    const { abrir, avisar } = pulsarMarcador('scentify.example', 'https://scentify.example/', 'x');
    expect(abrir).not.toHaveBeenCalled();
    expect(avisar).toHaveBeenCalledOnce();
  });

  it('no se deja engañar por un dominio que solo contiene «fragrantica»', () => {
    const { abrir } = pulsarMarcador('fragrantica.sitio-falso.com', FICHA, 'x');
    expect(abrir).not.toHaveBeenCalled();
  });

  it('recorta un texto desmedido', () => {
    const { abrir } = pulsarMarcador('www.fragrantica.com', FICHA, 'a'.repeat(MAXIMO_TEXTO + 50));
    const leido = leerFragmentoImportar(new URL(String(abrir.mock.calls[0]![0])).hash);
    expect(leido?.texto).toHaveLength(MAXIMO_TEXTO);
  });

  it('el Atajo de iOS produce el mismo fragmento', () => {
    let resultado = '';
    new Function('location', 'document', 'completion', codigoAtajo())(
      { href: FICHA },
      { body: { innerText: 'Notas de Salida\nBergamota' } },
      (valor: string) => (resultado = valor),
    );
    expect(leerFragmentoImportar(resultado)).toEqual({ url: FICHA, texto: 'Notas de Salida\nBergamota' });
  });

  it('un fragmento vacío no es nada que importar', () => {
    expect(leerFragmentoImportar('')).toBeNull();
    expect(leerFragmentoImportar('#otra=cosa')).toBeNull();
  });
});
