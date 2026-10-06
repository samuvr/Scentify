'use client';

/**
 * Actualizar concentracion, volumen y valoracion desde Excel: se descarga la
 * hoja, se edita fuera y se sube. Como la importacion CSV, se ve todo lo que
 * va a cambiar antes de confirmar.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { accionAplicarHoja, accionPrevisualizarHoja } from '@/app/acciones';
import type {
  AnalisisHoja,
  CampoEditable,
  DatosEditables,
} from '@/dominio/hoja-actualizacion';

const ETIQUETA: Record<CampoEditable, string> = {
  concentracion: 'Concentración',
  volumenMl: 'Volumen',
  valoracion: 'Valoración',
};

function mostrar(campo: CampoEditable, datos: DatosEditables): string {
  const valor = datos[campo];
  if (valor === null) return '—';
  if (campo === 'volumenMl') return `${valor} ml`;
  if (campo === 'valoracion') return `★ ${valor}`;
  return String(valor);
}

export function PanelHoja() {
  const router = useRouter();
  const [fichero, setFichero] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisHoja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const comoFormulario = (f: File) => {
    const datos = new FormData();
    datos.set('hoja', f);
    return datos;
  };

  async function elegir(f: File | undefined) {
    setAnalisis(null);
    setError(null);
    setResumen(null);
    setFichero(f ?? null);
    if (!f) return;
    setTrabajando(true);
    const respuesta = await accionPrevisualizarHoja(comoFormulario(f));
    setTrabajando(false);
    if (respuesta.ok) setAnalisis(respuesta.analisis);
    else setError(respuesta.error);
  }

  async function aplicar() {
    if (!fichero) return;
    setTrabajando(true);
    const respuesta = await accionAplicarHoja(comoFormulario(fichero));
    setTrabajando(false);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    const { actualizados, errores } = respuesta.resultado;
    setAnalisis(null);
    setFichero(null);
    setResumen(
      `Actualizados ${actualizados} ${actualizados === 1 ? 'perfume' : 'perfumes'}.` +
        (errores.length ? ` Con error: ${errores.join(' · ')}` : ''),
    );
    router.refresh();
  }

  return (
    <section className="tarjeta space-y-3">
      <h2 className="font-semibold">Actualizar desde Excel</h2>
      <p className="text-sm text-texto-tenue">
        Descarga tu colección en Excel, corrige la concentración, el volumen y la valoración de
        cada perfume y vuelve a subirla. El resto de columnas se ignora; una celda vacía borra el
        dato.
      </p>

      <a href="/api/exportar/hoja" className="boton-secundario w-full text-sm" download>
        Descargar colección en Excel
      </a>

      <input
        // Cambiar la clave vacia el input al terminar, para poder subir otra vez el mismo fichero.
        key={resumen ?? 'hoja'}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => elegir(e.target.files?.[0])}
        disabled={trabajando}
        className="text-sm"
        aria-label="Fichero Excel"
      />

      {trabajando && !analisis ? <p className="text-sm text-texto-tenue">Leyendo…</p> : null}
      {error ? <p className="aviso-error">{error}</p> : null}

      {analisis ? (
        <div className="space-y-3 border-t border-borde pt-3">
          <p className="text-sm">
            <strong>{analisis.cambios.length}</strong>{' '}
            {analisis.cambios.length === 1 ? 'perfume cambia' : 'perfumes cambian'}
            {analisis.sinCambios > 0 ? ` · ${analisis.sinCambios} sin cambios` : ''}
            {analisis.errores.length > 0 ? ` · ${analisis.errores.length} con error` : ''}
          </p>

          {analisis.columnasAusentes.length > 0 && analisis.cambios.length > 0 ? (
            <p className="text-sm text-texto-tenue">
              No están en la hoja, así que no se tocan:{' '}
              {analisis.columnasAusentes.map((c) => ETIQUETA[c].toLowerCase()).join(', ')}.
            </p>
          ) : null}

          {analisis.errores.length > 0 ? (
            <ul className="aviso-error space-y-1">
              {analisis.errores.slice(0, 10).map((e) => (
                <li key={`${e.linea}-${e.motivo}`}>
                  Fila {e.linea}: {e.motivo}
                </li>
              ))}
              {analisis.errores.length > 10 ? (
                <li>…y {analisis.errores.length - 10} más.</li>
              ) : null}
            </ul>
          ) : null}

          {analisis.cambios.length > 0 ? (
            <ul className="divide-y divide-borde text-sm">
              {analisis.cambios.map((c) => (
                <li key={c.id} className="py-2">
                  <p className="font-medium">
                    {c.nombre} <span className="text-texto-tenue">· {c.marca}</span>
                  </p>
                  {c.campos.map((campo) => (
                    <p key={campo} className="text-texto-tenue">
                      {ETIQUETA[campo]}: {mostrar(campo, c.antes)} →{' '}
                      <span className="text-texto">{mostrar(campo, c.despues)}</span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : null}

          {analisis.cambios.some((c) => c.campos.includes('concentracion')) ? (
            <p className="text-sm text-texto-tenue">
              La concentración es de la ficha del perfume: si otra persona tiene la misma ficha,
              también le puede cambiar a ella.
            </p>
          ) : null}

          <button
            type="button"
            disabled={analisis.cambios.length === 0 || trabajando}
            onClick={aplicar}
            className="boton-primario w-full"
          >
            {trabajando
              ? 'Actualizando…'
              : `Actualizar ${analisis.cambios.length} ${analisis.cambios.length === 1 ? 'perfume' : 'perfumes'}`}
          </button>
        </div>
      ) : null}

      {resumen ? <p className="aviso-hecho">{resumen}</p> : null}
    </section>
  );
}
