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
  { href: '/estadisticas', etiqueta: 'Stats', icono: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { href: '/mas', etiqueta: 'Más', icono: 'M5 12h.01M12 12h.01M19 12h.01' },
] as const;

export function NavegacionInferior() {
  const ruta = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-superficie/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación principal"
    >
      <ul className="mx-auto flex max-w-screen-sm">
        {DESTINOS.map(({ href, etiqueta, icono }) => {
          const activo = href === '/' ? ruta === '/' : ruta.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={activo ? 'page' : undefined}
                className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 text-xs
                  ${activo ? 'text-ambar' : 'text-texto-tenue'}`}
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
