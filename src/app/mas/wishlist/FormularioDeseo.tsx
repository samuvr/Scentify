'use client';

/**
 * Alta de un deseo (4.5) con el aviso de solapamiento de la 10.2.
 *
 * Las notas de fondo son opcionales, pero son las que permiten el aviso: si no
 * las pones, no hay con qué comparar. El aviso se enseña mientras escribes y
 * otra vez al guardar, y nunca impide guardar.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { accionComprobarSolapamiento, accionGuardarDeseo } from '@/app/acciones';
import type { Solapamiento } from '@/dominio/solapamiento';

export function FormularioDeseo({ notasConocidas }: { notasConocidas: string[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [notasFondo, setNotasFondo] = useState<string[]>([]);
  const [solapamientos, setSolapamientos] = useState<Solapamiento[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function añadirNota(nombre: string) {
    const limpio = nombre.trim();
    if (!limpio || notasFondo.includes(limpio)) return;
    const nuevas = [...notasFondo, limpio];
    setNotasFondo(nuevas);
    setSolapamientos(await accionComprobarSolapamiento(nuevas));
  }

  async function quitarNota(nombre: string) {
    const nuevas = notasFondo.filter((n) => n !== nombre);
    setNotasFondo(nuevas);
    setSolapamientos(await accionComprobarSolapamiento(nuevas));
  }

  async function guardar(datos: FormData) {
    setGuardando(true);
    setError(null);
    const respuesta = await accionGuardarDeseo(null, {
      nombre: String(datos.get('nombre') ?? ''),
      marca: String(datos.get('marca') ?? ''),
      prioridad: String(datos.get('prioridad') ?? 'EN_EL_RADAR'),
      precioObjetivo: datos.get('precioObjetivo') || null,
      notas: datos.get('notas') || null,
      notasFondo,
    });
    setGuardando(false);

    if (!respuesta.ok) {
      setError(respuesta.error ?? 'No se ha podido guardar.');
      return;
    }
    setAbierto(false);
    setNotasFondo([]);
    setSolapamientos([]);
    router.refresh();
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="boton-primario w-full">
        + Añadir deseo
      </button>
    );
  }

  return (
    <form action={guardar} className="tarjeta space-y-3">
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
        <label htmlFor="d-fondo">Notas de fondo</label>
        <p className="text-xs text-texto-tenue">
          Opcional, pero es lo que permite avisarte si se parece a algo que ya tienes.
        </p>
        {notasFondo.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {notasFondo.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => quitarNota(n)}
                className="etiqueta border-acento/50 text-acento"
              >
                {n} <span aria-hidden="true">×</span>
                <span className="sr-only">quitar</span>
              </button>
            ))}
          </div>
        ) : null}
        <input
          id="d-fondo"
          type="text"
          list="notas-conocidas"
          placeholder="Añadir nota y pulsar Intro…"
          className="mt-1"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            añadirNota(e.currentTarget.value);
            e.currentTarget.value = '';
          }}
        />
      </div>

      {solapamientos.length > 0 ? (
        <div className="aviso-atencion">
          <p className="font-medium">
            Se parece a {solapamientos.map((s) => s.nombre).join(' y ')}, que ya tienes.
          </p>
          <ul className="mt-1 space-y-0.5 text-texto-tenue">
            {solapamientos.map((s) => (
              <li key={s.perfumeId}>
                {s.nombre}: comparte {s.comunes.length} notas de fondo ({s.comunes.join(', ')})
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-texto-tenue">Es solo un aviso: puedes guardarlo igual.</p>
        </div>
      ) : null}

      <div>
        <label htmlFor="d-notas">Notas personales</label>
        <textarea id="d-notas" name="notas" rows={2} className="mt-1" />
      </div>

      {error ? <p className="aviso-error">{error}</p> : null}

      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierto(false)} className="boton-secundario flex-1">
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className="boton-primario flex-1">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <datalist id="notas-conocidas">
        {notasConocidas.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </form>
  );
}
