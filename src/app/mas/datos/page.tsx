/** Seccion 9 — Datos: exportar, importar y copia de seguridad. */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { PanelDatos } from './PanelDatos';

export const dynamic = 'force-dynamic';

export default async function PaginaDatos() {
  if (!(await usuarioActual())) redirect('/login');

  return (
    <div className="space-y-5">
      <h1 className="titulo">Datos</h1>
      <p className="text-sm text-texto-tenue">
        Aquí se introduce mucha información a mano. Exporta de vez en cuando.
      </p>

      <section className="tarjeta space-y-2">
        <h2 className="font-semibold">Exportar</h2>
        <a href="/api/exportar/coleccion" className="boton-secundario w-full text-sm" download>
          Colección en CSV
        </a>
        <a href="/api/exportar/usos" className="boton-secundario w-full text-sm" download>
          Histórico de usos en CSV
        </a>
        <a href="/api/exportar/copia" className="boton-secundario w-full text-sm" download>
          Copia completa en JSON
        </a>
      </section>

      <PanelDatos />
    </div>
  );
}
