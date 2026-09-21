'use client';

import { useState } from 'react';
import { accionGuardarDeseo } from '@/app/acciones';

export function FormularioDeseo() {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="boton-primario w-full">
        + Añadir deseo
      </button>
    );
  }

  return (
    <form action={accionGuardarDeseo} className="tarjeta space-y-3">
      <div>
        <label htmlFor="d-nombre">Nombre</label>
        <input id="d-nombre" name="nombre" required className="mt-1" />
      </div>
      <div>
        <label htmlFor="d-marca">Marca</label>
        <input id="d-marca" name="marca" required className="mt-1" />
      </div>
      <div>
        <label htmlFor="d-prioridad">Prioridad</label>
        <select id="d-prioridad" name="prioridad" defaultValue="EN_EL_RADAR" className="mt-1">
          <option value="EN_EL_RADAR">En el radar</option>
          <option value="LO_QUIERO">Lo quiero</option>
          <option value="LO_NECESITO">Lo necesito</option>
        </select>
      </div>
      <div>
        <label htmlFor="d-precio">Precio objetivo (€)</label>
        {/* Lo maximo que estoy dispuesto a pagar, no una estimacion de mercado. */}
        <input
          id="d-precio"
          name="precioObjetivo"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          className="mt-1"
        />
      </div>
      <div>
        <label htmlFor="d-notas">Notas</label>
        <textarea id="d-notas" name="notas" rows={2} className="mt-1" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="boton-secundario flex-1">
          Cancelar
        </button>
        <button type="submit" className="boton-primario flex-1">
          Guardar
        </button>
      </div>
    </form>
  );
}
