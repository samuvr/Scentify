'use client';

/**
 * Barra inferior fija: el pulgar llega sin recolocar la mano. Cinco destinos,
 * que es el maximo que cabe a 390 px con area tactil comoda.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DESTINOS = [
  { href: '/', etiqueta: 'Hoy', icono: 'M12 3v18M3 12h18' },
  { href: '/recomendacion', etiqueta: 'Sugerir', icono: 'M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6z' },
  { href: '/coleccion', etiqueta: 'Colección', icono: 'M4 6h16M4 12h16M4 18h16' },
  {
    href: '/asistente',
    etiqueta: 'Asistente',
    icono: 'M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z',
  },
  // Estadisticas cuelga de Mas: al estar dentro, se marca Mas.
  { href: '/mas', etiqueta: 'Más', icono: 'M5 12h.01M12 12h.01M19 12h.01', tambien: ['/estadisticas'] },
] as const;

function estaActivo(ruta: string, destino: (typeof DESTINOS)[number]): boolean {
  if (destino.href === '/') return ruta === '/';
  const prefijos = ['tambien' in destino ? destino.tambien : [], [destino.href]].flat();
  return prefijos.some((p) => ruta === p || ruta.startsWith(`${p}/`));
}

export function NavegacionInferior() {
  const ruta = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-superficie/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación principal"
    >
      <ul className="mx-auto flex max-w-screen-sm">
        {DESTINOS.map((destino) => {
          const { href, etiqueta, icono } = destino;
          const activo = estaActivo(ruta, destino);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={activo ? 'page' : undefined}
                className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 text-xs
                  ${activo ? 'text-acento' : 'text-texto-tenue'}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={activo ? 2.4 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={icono} />
                </svg>
                {etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
