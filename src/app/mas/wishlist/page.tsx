/** Seccion 4.5 — Wishlist. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { listarNotas, listarWishlist } from '@/servicios/consultas';
import { formatearFecha } from '@/componentes/BloquePromedios';
import { notasFondoDeDeseo } from '@/servicios/wishlist';
import { FormularioDeseo } from './FormularioDeseo';
import { TarjetaDeseo } from './TarjetaDeseo';

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
  const [todos, notas] = await Promise.all([
    listarWishlist(userId, orden === 'antiguedad' ? 'antiguedad' : 'prioridad'),
    listarNotas(),
  ]);
  // Lo ya comprado sale de la lista y queda abajo, en «Conseguidos».
  const deseos = todos.filter((d) => !d.convertidoAPerfumeId);
  const conseguidos = todos.filter((d) => d.convertidoAPerfumeId);
  const fondos = await Promise.all(deseos.map((d) => notasFondoDeDeseo(d.id)));
  const notasConocidas = notas.map((n) => n.nombre);

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

      <FormularioDeseo notasConocidas={notasConocidas} />

      <ul className="space-y-2">
        {deseos.map((d, i) => {
          const meses = mesesDesde(d.creadoEn.toISOString());
          const hrefConvertir = `/coleccion/nuevo?nombre=${encodeURIComponent(d.nombre)}&marca=${encodeURIComponent(d.marca)}&deseo=${d.id}${d.fragranticaUrl ? `&url=${encodeURIComponent(d.fragranticaUrl)}` : ''}`;
          return (
            <TarjetaDeseo
              key={d.id}
              deseo={{
                id: d.id,
                nombre: d.nombre,
                marca: d.marca,
                prioridad: d.prioridad,
                precioObjetivo: d.precioObjetivo,
                notas: d.notas,
                fragranticaUrl: d.fragranticaUrl,
                notasFondo: fondos[i] ?? [],
              }}
              notasConocidas={notasConocidas}
              hrefConvertir={hrefConvertir}
            >
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
            </TarjetaDeseo>
          );
        })}
      </ul>

      {deseos.length === 0 ? (
        <p className="tarjeta text-sm text-texto-tenue">La lista está vacía.</p>
      ) : null}

      {conseguidos.length > 0 ? (
        <details className="tarjeta">
          <summary className="cursor-pointer font-medium">
            Conseguidos <span className="text-texto-tenue">({conseguidos.length})</span>
          </summary>
          <ul className="mt-3 space-y-1 text-sm">
            {conseguidos.map((d) => (
              <li key={d.id}>
                <Link href={`/coleccion/${d.convertidoAPerfumeId}`} className="underline-offset-2 hover:underline">
                  {d.nombre}
                </Link>
                <span className="text-texto-tenue"> · {d.marca}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
