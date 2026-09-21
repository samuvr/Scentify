'use client';

/**
 * Lo unico que se pregunta: momento y contexto. Mas el desplegable para
 * sobrescribir la estacion, que la 7.1 exige que sea siempre posible.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { Estacion, Momento } from '@/dominio/tipos';

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};

export function SelectorPeticion({
  contextos,
  momento,
  contextoId,
  estacionesCompatibles,
  estacionesPropuestas,
  sobrescrita,
}: {
  contextos: { id: string; nombre: string }[];
  momento: Momento;
  contextoId: string;
  estacionesCompatibles: Estacion[];
  estacionesPropuestas: Estacion[];
  sobrescrita: boolean;
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [abierto, setAbierto] = useState(false);

  function navegar(cambios: Record<string, string | null>) {
    const nuevos = new URLSearchParams(parametros.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) nuevos.delete(clave);
      else nuevos.set(clave, valor);
    }
    router.push(`/recomendacion?${nuevos}`);
  }

  function alternarEstacion(estacion: Estacion) {
    const actuales = new Set(estacionesCompatibles);
    if (actuales.has(estacion)) actuales.delete(estacion);
    else actuales.add(estacion);
    navegar({ estaciones: actuales.size > 0 ? [...actuales].join(',') : null });
  }

  return (
    <section className="tarjeta space-y-4">
      <div>
        <span className="block text-sm font-medium text-texto-tenue">Momento</span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['DIA', 'NOCHE'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={momento === m}
              onClick={() => navegar({ momento: m })}
              className={`boton ${momento === m ? 'bg-ambar text-fondo' : 'border border-borde'}`}
            >
              {m === 'DIA' ? 'Día' : 'Noche'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-texto-tenue">Contexto</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {contextos.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={contextoId === c.id}
              onClick={() => navegar({ contexto: c.id })}
              className={`etiqueta ${contextoId === c.id ? 'border-ambar bg-ambar/15 text-ambar' : ''}`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="boton-fantasma w-full justify-between px-1 text-sm"
        >
          Estación: {estacionesCompatibles.map((e) => NOMBRE_ESTACION[e]).join(' + ') || '—'}
          {sobrescrita ? ' (a mano)' : ''}
          <span aria-hidden="true">{abierto ? '−' : '+'}</span>
        </button>

        {abierto ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(NOMBRE_ESTACION) as Estacion[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={estacionesCompatibles.includes(e)}
                  onClick={() => alternarEstacion(e)}
                  className={`etiqueta ${
                    estacionesCompatibles.includes(e) ? 'border-ambar bg-ambar/15 text-ambar' : ''
                  }`}
                >
                  {NOMBRE_ESTACION[e]}
                </button>
              ))}
            </div>
            {sobrescrita ? (
              <button
                type="button"
                onClick={() => navegar({ estaciones: null })}
                className="boton-fantasma px-1 text-sm"
              >
                Volver a la propuesta ({estacionesPropuestas.map((e) => NOMBRE_ESTACION[e]).join(' + ')})
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
