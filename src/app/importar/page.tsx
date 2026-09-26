'use client';

/**
 * Llegada del boton «Enviar a Scentify» y del Atajo de iOS.
 *
 * Lo que traen viaja detras del `#` (`#u=<direccion>&t=<texto>`): el
 * fragmento no sale del navegador, asi que los 17 kB de texto no pasan por
 * ninguna cabecera ni por los registros del servidor, y no hay limite de
 * longitud que preocupe. Desde aqui se manda a `/api/importar` con la sesion
 * de este sitio, y se salta al alta con la ficha ya leida.
 *
 * Se guarda en sessionStorage antes de nada: si no hay sesion, el login
 * vuelve aqui sin el fragmento, y lo compartido sigue esperando.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { leerFragmentoImportar } from '@/dominio/importador';

const CLAVE = 'scentify:importar';

interface Pendiente {
  url?: string;
  texto?: string;
}

function leerFragmento(): Pendiente | null {
  return leerFragmentoImportar(window.location.hash);
}

function guardado(): Pendiente | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Pendiente) : null;
  } catch {
    return null;
  }
}

function guardar(pendiente: Pendiente | null) {
  try {
    if (pendiente) sessionStorage.setItem(CLAVE, JSON.stringify(pendiente));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento se pierde solo el caso del login a mitad.
  }
}

export default function PaginaImportar() {
  const [estado, setEstado] = useState<'leyendo' | 'vacio' | 'error'>('leyendo');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const delFragmento = leerFragmento();
    if (delFragmento) {
      guardar(delFragmento);
      // Fuera de la barra de direcciones y del historial: es texto largo.
      window.history.replaceState(null, '', window.location.pathname);
    }
    const pendiente = delFragmento ?? guardado();
    if (!pendiente) {
      setEstado('vacio');
      return;
    }

    let cancelado = false;
    (async () => {
      try {
        const respuesta = await fetch('/api/importar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(pendiente),
        });
        if (cancelado) return;
        if (respuesta.status === 401) {
          window.location.replace(`/login?siguiente=${encodeURIComponent('/importar')}`);
          return;
        }
        const datos = (await respuesta.json()) as { destino?: string };
        if (!respuesta.ok || !datos.destino) throw new Error();
        guardar(null);
        window.location.replace(datos.destino);
      } catch {
        if (!cancelado) setEstado('error');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [intento]);

  return (
    <div className="space-y-5">
      <h1 className="titulo">Enviar a Scentify</h1>
      {estado === 'leyendo' ? <p className="text-texto-tenue">Leyendo la ficha…</p> : null}
      {estado === 'error' ? (
        <div className="space-y-3">
          <p className="aviso-error">
            No se ha podido leer lo enviado. Si no tienes conexión, vuelve a intentarlo cuando
            la tengas: no se ha perdido.
          </p>
          <button
            type="button"
            onClick={() => {
              setEstado('leyendo');
              setIntento((n) => n + 1);
            }}
            className="boton-primario w-full"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {estado === 'vacio' ? (
        <div className="space-y-3">
          <p className="aviso-atencion">
            No ha llegado ninguna ficha. Abre un perfume en Fragrantica y pulsa el botón «Enviar a
            Scentify» desde allí.
          </p>
          <Link href="/mas/importador" className="boton-secundario block w-full text-center">
            Cómo instalar el botón
          </Link>
        </div>
      ) : null}
    </div>
  );
}
