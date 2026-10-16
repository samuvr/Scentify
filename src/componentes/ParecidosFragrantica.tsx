/**
 * «Esta fragancia me recuerda a», de Fragrantica: los primeros del bloque con
 * sus votos a favor, en contra y el porcentaje a favor. Sale en la ficha del
 * perfume y, recien leido, en el formulario de alta.
 *
 * Sin estado ni efectos a proposito: lo usan tanto la ficha, que se pinta en
 * el servidor, como el formulario, que es de cliente.
 */
import { formatearFecha } from '@/componentes/BloquePromedios';
import { porcentajePositivo, type Parecido } from '@/dominio/parecidos';

const cifra = (n: number) => n.toLocaleString('es-ES');

export function ParecidosFragrantica({
  perfumes,
  leidosEl,
}: {
  perfumes: Parecido[];
  /** Dia en que se leyeron (AAAA-MM-DD, en la zona del usuario). Sin el no se dice nada. */
  leidosEl?: string;
}) {
  return (
    <div className="space-y-2">
      <ol className="divide-y divide-borde/70 border-y border-borde/70">
        {perfumes.map((p, i) => {
          const pct = porcentajePositivo(p);
          return (
            <li key={`${i}-${p.nombre}`} className="space-y-1.5 py-2">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0">
                  <span className="nombre-perfume block">{p.nombre}</span>
                  {p.marca ? <span className="block text-sm text-texto-tenue">{p.marca}</span> : null}
                </p>
                <p className="shrink-0 text-right text-sm">
                  <span className="font-semibold">{pct === null ? '—' : `${pct}%`}</span>
                  <span className="block text-xs text-texto-tenue">a favor</span>
                </p>
              </div>
              <div className="h-1.5 overflow-hidden bg-borde" aria-hidden="true">
                <div className="h-full bg-acento" style={{ width: `${pct ?? 0}%` }} />
              </div>
              <p className="text-xs text-texto-tenue">
                {cifra(p.positivos)} {p.positivos === 1 ? 'voto' : 'votos'} a favor ·{' '}
                {cifra(p.negativos)} en contra
              </p>
            </li>
          );
        })}
      </ol>
      {leidosEl ? (
        <p className="text-xs text-texto-tenue">
          Votos de Fragrantica a {formatearFecha(leidosEl)}.
        </p>
      ) : null}
    </div>
  );
}
