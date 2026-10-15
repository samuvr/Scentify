/**
 * Propuestas de recategorizacion con su evidencia y un boton para aplicar
 * solo ese cambio. Componente de servidor: cada boton es un formulario con
 * su accion, y funciona aunque el JavaScript aun no haya cargado.
 */
import Link from 'next/link';
import { accionAjustarMarca, accionRechazarPropuesta } from '@/app/acciones';
import { BotonEnviar } from './BotonEnviar';
import { explicarPropuesta, nombreDeValor, type PropuestaMarca } from '@/dominio/recategorizacion';

type Propuesta = PropuestaMarca & { perfumeId: string; nombre?: string };

export function PropuestasMarcas({
  propuestas,
  contextos,
  conPerfume = false,
}: {
  propuestas: Propuesta[];
  contextos: { id: string; nombre: string }[];
  /** En listas de varios perfumes, el nombre del perfume va delante. */
  conPerfume?: boolean;
}) {
  if (propuestas.length === 0) return null;
  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '—';

  return (
    <ul className="space-y-2">
      {propuestas.map((p) => {
        const valor = nombreDeValor(p.eje, p.valor, nombreContexto);
        const campos = (
          <>
            <input type="hidden" name="perfumeId" value={p.perfumeId} />
            <input type="hidden" name="eje" value={p.eje} />
            <input type="hidden" name="valor" value={p.valor} />
          </>
        );
        return (
          <li key={`${p.perfumeId}-${p.eje}-${p.valor}-${p.accion}`} className="tarjeta space-y-3 text-sm">
            <p>
              {conPerfume && p.nombre ? (
                <>
                  <Link href={`/coleccion/${p.perfumeId}`} className="nombre-perfume underline-offset-2 hover:underline">
                    {p.nombre}
                  </Link>
                  {': '}
                </>
              ) : null}
              {explicarPropuesta(p, valor)}
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={accionAjustarMarca}>
                {campos}
                <input type="hidden" name="accion" value={p.accion} />
                <BotonEnviar pendiente="Guardando…" className="boton-secundario px-4 text-sm">
                  {p.accion === 'añadir' ? `Añadir ${valor}` : `Quitar ${valor}`}
                </BotonEnviar>
              </form>
              <form action={accionRechazarPropuesta}>
                {campos}
                <BotonEnviar pendiente="…" className="boton-fantasma px-3 text-sm">
                  {p.accion === 'añadir' ? 'Fue casualidad' : 'Déjalo así'}
                </BotonEnviar>
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
