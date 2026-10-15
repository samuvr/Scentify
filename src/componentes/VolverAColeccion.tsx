'use client';

/**
 * «← Colección» en la ficha: vuelve a la lista con la busqueda y los filtros
 * con los que se llego. Antes solo el «atrás» del sistema los conservaba; la
 * pestaña de abajo los descartaba.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';

export const CLAVE_ULTIMA_COLECCION = 'scentify:coleccion';

export function VolverAColeccion() {
  const [destino, setDestino] = useState('/coleccion');
  useEffect(() => {
    try {
      const consulta = sessionStorage.getItem(CLAVE_ULTIMA_COLECCION);
      if (consulta) setDestino(`/coleccion?${consulta}`);
    } catch {
      // Sin sessionStorage, a la lista sin filtros.
    }
  }, []);
  return (
    <Link href={destino} className="text-sm text-texto-tenue underline underline-offset-2">
      ‹ Colección
    </Link>
  );
}
