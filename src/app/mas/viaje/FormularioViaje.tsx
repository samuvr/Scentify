'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Momento } from '@/dominio/tipos';
import type { Ubicacion } from '@/dominio/ubicacion';
import { accionBuscarDestino } from '@/app/acciones';

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
  const [busqueda, setBusqueda] = useState(parametros.get('lugar') ?? '');
  const [lugares, setLugares] = useState<Ubicacion[] | null>(null);
  const [avisoDestino, setAvisoDestino] = useState<string | null>(null);
  const [buscando, iniciarBusqueda] = useTransition();

  function buscarDestino() {
    const texto = busqueda.trim();
    if (texto.length < 2) return;
    setAvisoDestino(null);
    iniciarBusqueda(async () => {
      try {
        const encontrados = await accionBuscarDestino(texto);
        setLugares(encontrados);
        if (encontrados === null) {
          setAvisoDestino('No se ha podido buscar ahora. Prueba más tarde o usa tu posición actual.');
        } else if (encontrados.length === 0) {
          setAvisoDestino('No encuentro ese sitio. Prueba con el nombre de la ciudad.');
        }
      } catch {
        setLugares(null);
        setAvisoDestino('Sin conexión: no se puede buscar el destino ahora.');
      }
    });
  }

  function elegirDestino(lugar: Ubicacion) {
    setLugares(null);
    setBusqueda(lugar.etiqueta);
    poner({ lugar: lugar.etiqueta, lat: lugar.lat.toFixed(4), lon: lugar.lon.toFixed(4) });
  }

  /** Para cuando ya se esta alli. El permiso solo se pide al pulsar. */
  function usarPosicionActual() {
    if (!('geolocation' in navigator)) {
      setAvisoDestino('Este navegador no da la ubicación.');
      return;
    }
    setAvisoDestino('Buscando dónde estás…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setAvisoDestino(null);
        elegirDestino({ lat: coords.latitude, lon: coords.longitude, etiqueta: 'Donde estoy ahora' });
      },
      () => setAvisoDestino('No se ha podido obtener la ubicación.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                buscarDestino();
              }}
              className="space-y-2"
            >
              <label htmlFor="v-lugar">¿Adónde vas?</label>
              <div className="flex gap-2">
                <input
                  id="v-lugar"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Sevilla, Lisboa, Dubái…"
                  enterKeyHint="search"
                  autoComplete="off"
                  className="min-w-0 flex-1"
                />
                <button
                  type="submit"
                  disabled={buscando || busqueda.trim().length < 2}
                  className="boton-secundario shrink-0 px-4"
                >
                  {buscando ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
            </form>

            {lugares && lugares.length > 0 ? (
              <ul className="space-y-2" aria-label="Destinos encontrados">
                {lugares.map((lugar) => (
                  <li key={`${lugar.lat},${lugar.lon}`}>
                    <button
                      type="button"
                      onClick={() => elegirDestino(lugar)}
                      className="tarjeta block w-full text-left text-sm"
                    >
                      {lugar.etiqueta}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <button type="button" onClick={usarPosicionActual} className="boton-fantasma px-1 text-sm">
              Usar mi posición actual
            </button>

            {avisoDestino ? (
              <p className="text-sm text-texto-tenue" role="status">
                {avisoDestino}
              </p>
            ) : null}

            {parametros.get('lat') ? (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setLugares(null);
                  poner({ lat: '', lon: '', lugar: '' });
                }}
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
