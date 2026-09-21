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
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/*
        Las extensiones del navegador (gestores de color, traductores, lectores
        de contrasenas) anaden atributos al <body> antes de que React hidrate, y
        eso dispara un aviso de discrepancia que no viene de la app y que no se
        puede evitar desde aqui. Se silencia solo en este elemento: el aviso
        sigue activo para sus hijos, que es donde si importaria.
      */}
      <body className="min-h-dvh" suppressHydrationWarning>
        {/* El hueco inferior deja sitio a la barra fija. */}
        <main className="contenedor pb-28 pt-4">{children}</main>
        <NavegacionInferior />
      </body>
    </html>
  );
}
