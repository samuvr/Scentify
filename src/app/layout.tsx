import type { Metadata, Viewport } from 'next';
import { NavegacionInferior } from '@/componentes/NavegacionInferior';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scentify',
  description: 'Mi colección de perfumes',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Scentify' },
};

export const viewport: Viewport = {
  themeColor: '#12100e',
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">
        {/* El hueco inferior deja sitio a la barra fija. */}
        <main className="contenedor pb-28 pt-4">{children}</main>
        <NavegacionInferior />
      </body>
    </html>
  );
}
