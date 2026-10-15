'use client';

/**
 * Lo que se ve cuando una pantalla falla, en vez del «Application error» de
 * Next en ingles. Vive dentro del layout, asi que la barra inferior sigue ahi.
 *
 * Lo mas habitual es que falte la red (una accion de servidor sin cobertura,
 * una pantalla que no estaba guardada): por eso lo dice, y «Reintentar» vuelve
 * a pedir la pantalla al servidor en vez de repintar el mismo error.
 */
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function ErrorDePantalla({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [reintentando, iniciar] = useTransition();
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    console.error(error);
    setSinConexion(!navigator.onLine);
  }, [error]);

  const reintentar = () =>
    iniciar(() => {
      router.refresh();
      reset();
    });

  return (
    <div className="space-y-4 pt-12 text-center" role="alert">
      <h1 className="titulo">{sinConexion ? 'Sin conexión' : 'Algo ha fallado'}</h1>
      <p className="text-texto-tenue">
        {sinConexion
          ? 'Esta pantalla necesita conexión. Los usos que registres en Hoy se guardan en el móvil y se envían solos al volver la cobertura.'
          : 'No se ha podido cargar esta pantalla. No se ha perdido nada de lo que ya estaba guardado.'}
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={reintentar} disabled={reintentando} className="boton-primario">
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </button>
        {/* Navegacion completa: sin red, el service worker sirve Hoy desde la cache. */}
        <a href="/" className="boton-secundario">
          Volver a Hoy
        </a>
      </div>
    </div>
  );
}
