'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { Momento } from '@/dominio/tipos';

export function FormularioViaje({
  contextos,
  elegidos,
  momentos,
  fecha,
  tope,
  destino,
}: {
  contextos: { id: string; nombre: string }[];
  elegidos: string[];
  momentos: Momento[];
  fecha: string;
  tope: number | undefined;
  destino: { lat: number; lon: number; etiqueta: string };
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [otroDestino, setOtroDestino] = useState(Boolean(parametros.get('lat')));

  function poner(cambios: Record<string, string>) {
    const nuevos = new URLSearchParams(parametros.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
    }
    router.push(`/mas/viaje?${nuevos}`);
  }

  const alternar = (lista: string[], valor: string) =>
    lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];

  return (
    <section className="tarjeta space-y-4">
      <div>
        <span className="block text-sm font-medium text-texto-tenue">Contextos previstos</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {contextos.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={elegidos.includes(c.id)}
              onClick={() => poner({ contextos: alternar(elegidos, c.id).join(',') })}
              className="chip"
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium text-texto-tenue">Momentos a cubrir</span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(['DIA', 'NOCHE'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={momentos.includes(m)}
              onClick={() => {
                const nuevos = alternar(momentos, m);
                if (nuevos.length > 0) poner({ momentos: nuevos.join(',') });
              }}
              className="opcion"
            >
              {m === 'DIA' ? 'Día' : 'Noche'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="v-fecha">Fecha del viaje</label>
          <input
            id="v-fecha"
            type="date"
            defaultValue={fecha}
            onChange={(e) => poner({ fecha: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="v-tope">Máximo de frascos</label>
          <input
            id="v-tope"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="sin tope"
            defaultValue={tope ?? ''}
            onChange={(e) => poner({ tope: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setOtroDestino((v) => !v)}
          aria-expanded={otroDestino}
          className="boton-fantasma w-full justify-between px-1 text-sm"
        >
          Destino: {destino.etiqueta}
          <span aria-hidden="true">{otroDestino ? '−' : '+'}</span>
        </button>

        {otroDestino ? (
          <div className="mt-2 space-y-3">
            <p className="text-xs text-texto-tenue">
              La estación se calcula con el tiempo de allí, no con el de casa.
            </p>
            <div>
              <label htmlFor="v-lugar">Nombre del destino</label>
              <input
                id="v-lugar"
                defaultValue={parametros.get('lugar') ?? ''}
                onBlur={(e) => poner({ lugar: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="v-lat">Latitud</label>
                <input
                  id="v-lat"
                  type="number"
                  step="0.0001"
                  defaultValue={parametros.get('lat') ?? ''}
                  onBlur={(e) => poner({ lat: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="v-lon">Longitud</label>
                <input
                  id="v-lon"
                  type="number"
                  step="0.0001"
                  defaultValue={parametros.get('lon') ?? ''}
                  onBlur={(e) => poner({ lon: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            {parametros.get('lat') ? (
              <button
                type="button"
                onClick={() => poner({ lat: '', lon: '', lugar: '' })}
                className="boton-fantasma px-1 text-sm"
              >
                Volver a mi ubicación
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
