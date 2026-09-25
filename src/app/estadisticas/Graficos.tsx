/**
 * Graficos de las estadisticas, en SVG y CSS puros: a 390 px una libreria de
 * charts pesa mas que todo lo que dibuja.
 */
import type { CeldaHeatmap } from '@/dominio/estadisticas';
import type { Comparacion } from '@/dominio/estadisticas';
import { formatearFecha } from '@/componentes/BloquePromedios';

export function Comparativa({
  titulo,
  comparacion,
  formato = 'entero',
  destacada = false,
}: {
  titulo: string;
  comparacion: Comparacion;
  formato?: 'entero' | 'pct' | 'ratio';
  /** El indicador que mas dice del periodo: a todo el ancho y mas grande. */
  destacada?: boolean;
}) {
  const mostrar = (valor: number) =>
    formato === 'pct' ? `${valor}%` : formato === 'ratio' ? valor.toFixed(2) : String(valor);

  const sube = comparacion.diferencia > 0;
  const baja = comparacion.diferencia < 0;

  return (
    <div className={`tarjeta space-y-1 ${destacada ? 'col-span-3 border-acento/50 p-4' : 'p-3'}`}>
      <p className="subtitulo">{titulo}</p>
      <p className={`font-display font-semibold ${destacada ? 'text-5xl text-acento' : 'text-2xl'}`}>
        {mostrar(comparacion.actual)}
      </p>
      <p
        className={`text-xs ${sube ? 'text-id-total' : baja ? 'text-id-nula' : 'text-texto-tenue'}`}
      >
        {sube ? '▲' : baja ? '▼' : '='} {mostrar(Math.abs(comparacion.diferencia))}
        {comparacion.variacionPct !== null ? ` (${comparacion.variacionPct}%)` : ''}
        <span className="text-texto-tenue"> vs. anterior</span>
      </p>
    </div>
  );
}

export function Barras({
  titulo,
  datos,
}: {
  titulo: string;
  datos: { nombre: string; usos: number }[];
}) {
  if (datos.length === 0) return null;
  const maximo = Math.max(...datos.map((d) => d.usos));

  return (
    <section className="space-y-2">
      <h2 className="subtitulo">{titulo}</h2>
      <ul className="space-y-1.5">
        {datos.map((d) => (
          <li key={d.nombre} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="min-w-0 truncate">{d.nombre}</span>
              <span className="text-texto-tenue">{d.usos}</span>
            </div>
            <div className="h-2 overflow-hidden bg-superficie-alta">
              {/* En acento lo que domina (todos, si empatan en cabeza); el resto, neutro. */}
              <div
                className={`h-full ${d.usos === maximo ? 'bg-acento' : 'bg-texto-tenue/50'}`}
                style={{ width: `${Math.round((100 * d.usos) / maximo)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Calendario de contribuciones. Va en scroll horizontal controlado. */
export function Heatmap({ semanas, hasta }: { semanas: CeldaHeatmap[][]; hasta: string }) {
  const maximo = Math.max(1, ...semanas.flat().map((c) => c.registros));
  const tono = (registros: number) => {
    if (registros === 0) return 'bg-superficie-alta';
    const intensidad = registros / maximo;
    if (intensidad > 0.66) return 'bg-acento';
    if (intensidad > 0.33) return 'bg-acento/70';
    return 'bg-acento/40';
  };

  return (
    <div className="tabla-scroll">
      <div className="flex gap-1 pb-2">
        {semanas.map((semana) => (
          <div key={semana[0]?.fecha} className="flex flex-col gap-1">
            {semana.map((celda) => (
              <span
                key={celda.fecha}
                title={`${formatearFecha(celda.fecha)}: ${celda.registros} ${
                  celda.registros === 1 ? 'registro' : 'registros'
                }`}
                className={`h-3 w-3 ${
                  celda.fecha > hasta ? 'bg-transparent' : tono(celda.registros)
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
