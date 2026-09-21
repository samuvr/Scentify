/**
 * Seccion 6.2 — La idoneidad nunca se enseña como un numero suelto: siempre con
 * su etiqueta, su color y el desglose por eje.
 */
import type { EjesIdoneidad, PorcentajeIdoneidad } from '@/dominio/tipos';

const ESTILO: Record<PorcentajeIdoneidad, { etiqueta: string; clase: string }> = {
  100: { etiqueta: 'Total', clase: 'bg-id-total/15 text-id-total border-id-total/40' },
  67: { etiqueta: 'Alta', clase: 'bg-id-alta/15 text-id-alta border-id-alta/40' },
  33: { etiqueta: 'Parcial', clase: 'bg-id-parcial/15 text-id-parcial border-id-parcial/40' },
  0: { etiqueta: 'Nula', clase: 'bg-id-nula/15 text-id-nula border-id-nula/40' },
};

const NOMBRE_EJE: Record<keyof EjesIdoneidad, string> = {
  momento: 'Momento',
  contexto: 'Contexto',
  estacion: 'Estación',
};

export function InsigniaIdoneidad({ pct }: { pct: number }) {
  const { etiqueta, clase } = ESTILO[(pct as PorcentajeIdoneidad) ?? 0] ?? ESTILO[0];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-3 py-1 text-sm font-semibold ${clase}`}>
      {pct}% · {etiqueta}
    </span>
  );
}

/** Los tres ejes con su marca, para que se vea de un vistazo cuál falla. */
export function DesgloseIdoneidad({
  detalle,
  explicacion,
}: {
  detalle: EjesIdoneidad;
  explicacion?: string;
}) {
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {(['momento', 'contexto', 'estacion'] as const).map((eje) => (
          <li
            key={eje}
            className={`etiqueta gap-1.5 ${
              detalle[eje] ? 'border-id-total/40 text-id-total' : 'border-id-nula/40 text-id-nula'
            }`}
          >
            <span aria-hidden="true">{detalle[eje] ? '✓' : '✕'}</span>
            {NOMBRE_EJE[eje]}
            <span className="sr-only">{detalle[eje] ? ': encaja' : ': no encaja'}</span>
          </li>
        ))}
      </ul>
      {explicacion ? <p className="text-sm text-texto-tenue">{explicacion}</p> : null}
    </div>
  );
}
