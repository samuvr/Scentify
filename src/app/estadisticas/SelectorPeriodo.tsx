'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Periodo, RangoFechas } from '@/dominio/estadisticas';

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
  contextos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const parametros = useSearchParams();

  function poner(cambios: Record<string, string>) {
    const nuevos = new URLSearchParams(parametros.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
    }
    router.push(`/estadisticas?${nuevos}`);
  }

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
            <option value="DIA">Día</option>
            <option value="NOCHE">Noche</option>
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
            {contextos.map((c) => (
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
