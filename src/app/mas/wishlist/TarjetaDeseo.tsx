'use client';

/**
 * Un deseo de la wishlist: se edita en el sitio y «Quitar» pregunta antes.
 * Antes no se podia corregir nada (habia que borrarlo y volver a escribirlo)
 * y «Quitar» borraba al primer toque.
 */
import Link from 'next/link';
import { useState } from 'react';
import { accionBorrarDeseo } from '@/app/acciones';
import { FormularioDeseo, type DeseoEditable } from './FormularioDeseo';

export function TarjetaDeseo({
  deseo,
  notasConocidas,
  hrefConvertir,
  children,
}: {
  deseo: DeseoEditable;
  notasConocidas: string[];
  hrefConvertir: string;
  /** La parte de solo lectura, pintada en el servidor. */
  children: React.ReactNode;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <li>
        <FormularioDeseo
          notasConocidas={notasConocidas}
          deseo={deseo}
          alCerrar={() => setEditando(false)}
        />
      </li>
    );
  }

  return (
    <li className="tarjeta space-y-2">
      {children}
      <div className="flex gap-2">
        <Link href={hrefConvertir} className="boton-primario flex-1 text-sm">
          Convertir en colección
        </Link>
        <button type="button" onClick={() => setEditando(true)} className="boton-secundario px-4 text-sm">
          Editar
        </button>
        <form
          action={accionBorrarDeseo}
          onSubmit={(e) => {
            if (!window.confirm(`¿Quitar ${deseo.nombre} de la wishlist?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={deseo.id} />
          <button type="submit" className="boton-fantasma px-3 text-sm">
            Quitar
          </button>
        </form>
      </div>
    </li>
  );
}
