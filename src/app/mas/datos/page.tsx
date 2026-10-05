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

      <section className="tarjeta space-y-2">
        <h2 className="font-semibold">Preguntar a una IA</h2>
        <p className="text-sm text-texto-tenue">
          Tu colección con sus notas, tus marcas y cómo la usas, en un JSON pensado para adjuntarlo
          en Claude o cualquier otro asistente y preguntarle qué notas te faltan o qué ponerte.
        </p>
        <a href="/api/exportar/ia" className="boton-primario w-full text-sm" download>
          Exportar colección para IA
        </a>
      </section>

      <PanelDatos />
    </div>
  );
}
