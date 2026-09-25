/** Seccion 4.5 — Wishlist. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { listarNotas, listarWishlist } from '@/servicios/consultas';
import { formatearFecha } from '@/componentes/BloquePromedios';
import { accionBorrarDeseo } from '@/app/acciones';
import { FormularioDeseo } from './FormularioDeseo';

export const dynamic = 'force-dynamic';

const PRIORIDAD: Record<string, { texto: string; clase: string }> = {
  LO_NECESITO: { texto: 'Lo necesito', clase: 'bg-id-nula/15 text-id-nula' },
  LO_QUIERO: { texto: 'Lo quiero', clase: 'bg-id-parcial/15 text-id-parcial' },
  EN_EL_RADAR: { texto: 'En el radar', clase: '' },
};

/** Cuanto lleva un deseo esperando: la pregunta de "¿por qué no lo he comprado?". */
function mesesDesde(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / (30 * 86_400_000));
}

export default async function PaginaWishlist({
  searchParams,
}: {
  searchParams: Promise<{ orden?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { orden } = await searchParams;
  const [deseos, notas] = await Promise.all([
    listarWishlist(userId, orden === 'antiguedad' ? 'antiguedad' : 'prioridad'),
    listarNotas(),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="titulo">Wishlist</h1>
        <div className="flex gap-2 text-sm">
          <Link
            href="/mas/wishlist"
            data-activo={orden !== 'antiguedad'}
            className="chip"
          >
            Prioridad
          </Link>
          <Link
            href="/mas/wishlist?orden=antiguedad"
            data-activo={orden === 'antiguedad'}
            className="chip"
          >
            Antigüedad
          </Link>
        </div>
      </header>

      <FormularioDeseo notasConocidas={notas.map((n) => n.nombre)} />

      <ul className="space-y-2">
        {deseos.map((d) => {
          const meses = mesesDesde(d.creadoEn.toISOString());
          return (
            <li key={d.id} className="tarjeta space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="nombre-perfume text-lg">{d.nombre}</p>
                  <p className="text-sm text-texto-tenue">{d.marca}</p>
                </div>
                <span className={`etiqueta text-xs ${PRIORIDAD[d.prioridad]?.clase ?? ''}`}>
                  {PRIORIDAD[d.prioridad]?.texto ?? d.prioridad}
                </span>
              </div>
              <p className="text-sm text-texto-tenue">
                {d.precioObjetivo ? `Hasta ${d.precioObjetivo} € · ` : ''}
                desde {formatearFecha(d.creadoEn.toISOString().slice(0, 10))}
                {meses >= 3 ? ` · lleva ${meses} meses ahí` : ''}
              </p>
              {d.notas ? <p className="text-sm">{d.notas}</p> : null}
              <div className="flex gap-2">
                <Link
                  href={`/coleccion/nuevo?nombre=${encodeURIComponent(d.nombre)}&marca=${encodeURIComponent(d.marca)}${d.fragranticaUrl ? `&url=${encodeURIComponent(d.fragranticaUrl)}` : ''}`}
                  className="boton-primario flex-1 text-sm"
                >
                  Convertir en colección
                </Link>
                <form action={accionBorrarDeseo}>
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="boton-secundario px-4 text-sm">
                    Quitar
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      {deseos.length === 0 ? (
        <p className="tarjeta text-sm text-texto-tenue">La lista está vacía.</p>
      ) : null}
    </div>
  );
}
