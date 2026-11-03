'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Periodo, RangoFechas } from '@/dominio/estadisticas';
import { admiteMomento, momentosDe } from '@/dominio/contextos';
import type { Momento } from '@/dominio/tipos';

const ETIQUETAS: Record<Periodo, string> = {
  '30d': '30 días',
  '90d': '90 días',
  'anio-en-curso': 'Año en curso',
  '365d': '365 días',
  personalizado: 'Personalizado',
};

export function SelectorPeriodo({
  periodo,
  rango,
  contextos,
}: {
  periodo: Periodo;
  rango: RangoFechas;
  /** Con sus momentos: la oficina de noche no se ofrece. */
  contextos: { id: string; nombre: string; atemporal: boolean; momentos: Momento[] }[];
}) {
  const router = useRouter();
  const parametros = useSearchParams();

  function poner(cambios: Record<string, string>) {
    const nuevos = new URLSearchParams(parametros.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
    }
    // Contexto y momento solo se combinan si el contexto existe en ese
    // momento: elegir Oficina quita «Noche», y al reves.
    const contexto = contextos.find((c) => c.id === nuevos.get('contexto'));
    const momento = nuevos.get('momento');
    if (contexto && (momento === 'DIA' || momento === 'NOCHE') && !admiteMomento(contexto, momento)) {
      nuevos.delete('contexto' in cambios ? 'momento' : 'contexto');
    }
    router.push(`/estadisticas?${nuevos}`);
  }

  const contextoElegido = contextos.find((c) => c.id === parametros.get('contexto'));
  const momentoElegido = (['DIA', 'NOCHE'] as const).find((m) => m === parametros.get('momento'));

  return (
    <section className="space-y-3">
      {/* En varias lineas y no en scroll: a 390 px el ultimo periodo quedaba oculto. */}
      <div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ETIQUETAS) as Periodo[]).map((clave) => (
            <button
              key={clave}
              type="button"
              aria-pressed={periodo === clave}
              onClick={() => poner({ periodo: clave })}
              className="chip"
            >
              {ETIQUETAS[clave]}
            </button>
          ))}
        </div>
      </div>

      {periodo === 'personalizado' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="desde">Desde</label>
            <input
              id="desde"
              type="date"
              defaultValue={rango.desde}
              onChange={(e) => poner({ desde: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="hasta">Hasta</label>
            <input
              id="hasta"
              type="date"
              defaultValue={rango.hasta}
              onChange={(e) => poner({ hasta: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="momento">Momento</label>
          <select
            id="momento"
            value={parametros.get('momento') ?? ''}
            onChange={(e) => poner({ momento: e.target.value })}
            className="mt-1"
          >
            <option value="">Ambos</option>
            {(contextoElegido ? momentosDe(contextoElegido) : (['DIA', 'NOCHE'] as const)).map((m) => (
              <option key={m} value={m}>
                {m === 'DIA' ? 'Día' : 'Noche'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="contexto">Contexto</label>
          <select
            id="contexto"
            value={parametros.get('contexto') ?? ''}
            onChange={(e) => poner({ contexto: e.target.value })}
            className="mt-1"
          >
            <option value="">Todos</option>
            {contextos
              .filter((c) => !momentoElegido || admiteMomento(c, momentoElegido))
              .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
