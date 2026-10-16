import type { Metadata } from 'next';

/** La pagina es de cliente y no puede exportar su titulo: lo pone este layout. */
export const metadata: Metadata = { title: 'Importar' };

export default function LayoutImportar({ children }: { children: React.ReactNode }) {
  return children;
}
