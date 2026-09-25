/**
 * Seccion 6.2 — La idoneidad nunca se enseña como un numero suelto: siempre con
 * su etiqueta, su color y el desglose por eje.
 */
import type { EjesIdoneidad, PorcentajeIdoneidad } from '@/dominio/tipos';

const ESTILO: Record<PorcentajeIdoneidad, { etiqueta: string; clase: string }> = {
  100: { etiqueta: 'Total', clase: 'bg-id-total/15 text-id-total' },
  67: { etiqueta: 'Alta', clase: 'bg-id-alta/15 text-id-alta' },
  33: { etiqueta: 'Parcial', clase: 'bg-id-parcial/15 text-id-parcial' },
  0: { etiqueta: 'Nula', clase: 'bg-id-nula/15 text-id-nula' },
};

const NOMBRE_EJE: Record<keyof EjesIdoneidad, string> = {
  momento: 'Momento',
  contexto: 'Contexto',
  estacion: 'Estación',
};

export function InsigniaIdoneidad({ pct }: { pct: number }) {
  const { etiqueta, clase } = ESTILO[(pct as PorcentajeIdoneidad) ?? 0] ?? ESTILO[0];
  return (
    // Informativa: tinte de fondo y sin borde, para que no parezca un boton.
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-sm font-semibold ${clase}`}>
      {pct}% · {etiqueta}
    </span>
  );
}

/**
 * Los tres ejes con su marca, para que se vea de un vistazo cuál falla. El que
 * falla es el que tiene que llamar la atención, así que va en rojo y en
 * negrita; los que encajan, en verde y discretos.
 */
export function DesgloseIdoneidad({
  detalle,
  explicacion,
}: {
  detalle: EjesIdoneidad;
  explicacion?: string;
}) {
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {(['momento', 'contexto', 'estacion'] as const).map((eje) => (
          <li
            key={eje}
            className={`inline-flex items-center gap-1.5 ${
              detalle[eje] ? 'text-texto-tenue' : 'font-semibold text-id-nula'
            }`}
          >
            <span aria-hidden="true" className={detalle[eje] ? 'text-id-total' : ''}>
              {detalle[eje] ? '✓' : '✕'}
            </span>
            {NOMBRE_EJE[eje]}
            <span className="sr-only">{detalle[eje] ? ': encaja' : ': no encaja'}</span>
          </li>
        ))}
      </ul>
      {explicacion ? <p className="text-sm text-texto-tenue">{explicacion}</p> : null}
    </div>
  );
}
