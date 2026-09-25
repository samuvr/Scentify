'use client';

import { useState } from 'react';
import type { Ubicacion } from '@/dominio/ubicacion';

/**
 * Seccion de ubicacion de la configuracion. El permiso de geolocalizacion solo
 * se pide al pulsar el boton, nunca al abrir la app.
 */
export function CamposUbicacion({
  modoInicial,
  ubicacion,
}: {
  modoInicial: 'auto' | 'fija';
  ubicacion: Ubicacion;
}) {
  const [modo, setModo] = useState(modoInicial);
  const [lat, setLat] = useState(String(ubicacion.lat));
  const [lon, setLon] = useState(String(ubicacion.lon));
  const [etiqueta, setEtiqueta] = useState(ubicacion.etiqueta);
  const [aviso, setAviso] = useState<string | null>(null);

  function usarPosicionActual() {
    if (!('geolocation' in navigator)) {
      setAviso('Este navegador no da la ubicación.');
      return;
    }
    setAviso('Buscando…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLat(coords.latitude.toFixed(4));
        setLon(coords.longitude.toFixed(4));
        setEtiqueta((actual) => (actual === ubicacion.etiqueta ? 'Mi ubicación' : actual));
        setModo('fija');
        setAviso('Listo. Ponle un nombre y guarda.');
      },
      () => setAviso('No se ha podido obtener la ubicación.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }

  return (
    <>
      <input type="hidden" name="modoUbicacion" value={modo} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={modo === 'auto'}
          onClick={() => setModo('auto')}
          className="opcion"
        >
          Automática
        </button>
        <button
          type="button"
          aria-pressed={modo === 'fija'}
          onClick={() => setModo('fija')}
          className="opcion"
        >
          Fija
        </button>
      </div>

      {modo === 'auto' ? (
        <p className="text-sm text-texto-tenue">
          Se deduce de tu conexión cada vez que abres la app: ahora mismo,{' '}
          <strong>{ubicacion.etiqueta}</strong>. Es aproximada (a nivel de ciudad), suficiente para
          el tiempo.
        </p>
      ) : (
        <>
          <div>
            <label htmlFor="etiqueta">Nombre</label>
            <input
              id="etiqueta"
              name="etiqueta"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lat">Latitud</label>
              <input
                id="lat"
                name="lat"
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="lon">Longitud</label>
              <input
                id="lon"
                name="lon"
                type="number"
                step="0.0001"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </>
      )}

      <button type="button" onClick={usarPosicionActual} className="boton-secundario w-full">
        Usar mi posición actual
      </button>
      {aviso ? <p className="text-xs text-texto-tenue">{aviso}</p> : null}
    </>
  );
}
