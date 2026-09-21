'use client';

/**
 * Seccion 6.1 — Duracion, valoracion y comentario se rellenan despues, por la
 * noche, desde el historial. No tocan el snapshot de idoneidad.
 */
import { useState } from 'react';
import { accionCompletarUso } from '@/app/acciones';
import type { DuracionPercibida } from '@/dominio/tipos';

export function CompletarUso({
  usoId,
  sprays,
  duracion,
  valoracion,
}: {
  usoId: string;
  sprays: number | null;
  duracion: DuracionPercibida | null;
  valoracion: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const completo = duracion !== null && valoracion !== null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="boton-fantasma px-1 text-sm"
      >
        {completo ? 'Editar detalles' : 'Completar detalles'}
      </button>

      {abierto ? (
        <form action={accionCompletarUso} className="mt-2 space-y-3">
          <input type="hidden" name="usoId" value={usoId} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`sprays-${usoId}`}>Sprays</label>
              <input
                id={`sprays-${usoId}`}
                name="sprays"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={sprays ?? ''}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor={`val-${usoId}`}>Valoración</label>
              <select id={`val-${usoId}`} name="valoracionDia" defaultValue={valoracion ?? ''} className="mt-1">
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`dur-${usoId}`}>Duración percibida</label>
            <select id={`dur-${usoId}`} name="duracionPercibida" defaultValue={duracion ?? ''} className="mt-1">
              <option value="">—</option>
              <option value="MENOS_2H">Menos de 2h</option>
              <option value="DE_2_4H">2-4h</option>
              <option value="DE_4_6H">4-6h</option>
              <option value="DE_6_8H">6-8h</option>
              <option value="MAS_8H">Más de 8h</option>
            </select>
          </div>
          <div>
            <label htmlFor={`com-${usoId}`}>Comentario</label>
            <textarea id={`com-${usoId}`} name="comentario" rows={2} className="mt-1" />
          </div>
          <button type="submit" className="boton-primario w-full text-sm">
            Guardar
          </button>
        </form>
      ) : null}
    </div>
  );
}
