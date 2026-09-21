'use client';

/**
 * Importacion con previsualizacion y validacion ANTES de confirmar, y
 * restauracion de la copia completa, que es destructiva y se confirma escribiendo.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  accionImportar,
  accionPrevisualizarImportacion,
  accionRestaurarCopia,
} from '@/app/acciones';
import type { PrevisualizacionImportacion } from '@/servicios/datos';

export function PanelDatos() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [previa, setPrevia] = useState<PrevisualizacionImportacion | null>(null);
  const [omitirDuplicados, setOmitirDuplicados] = useState(true);
  const [resumen, setResumen] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const [confirmacion, setConfirmacion] = useState('');
  const [errorCopia, setErrorCopia] = useState<string | null>(null);

  async function leerFichero(fichero: File | undefined, destino: (t: string) => void) {
    if (!fichero) return;
    destino(await fichero.text());
  }

  async function previsualizar() {
    setTrabajando(true);
    setResumen(null);
    setPrevia(await accionPrevisualizarImportacion(csv));
    setTrabajando(false);
  }

  async function confirmarImportacion() {
    setTrabajando(true);
    const resultado = await accionImportar(csv, omitirDuplicados);
    setTrabajando(false);
    setPrevia(null);
    setCsv('');
    setResumen(
      `Importados ${resultado.creados}. Omitidos por duplicado: ${resultado.omitidos}.` +
        (resultado.errores.length ? ` Con error: ${resultado.errores.length}.` : ''),
    );
    router.refresh();
  }

  async function restaurar(json: string) {
    setTrabajando(true);
    const resultado = await accionRestaurarCopia(json);
    setTrabajando(false);
    if (resultado.ok) {
      setErrorCopia(null);
      setConfirmacion('');
      setResumen('Copia restaurada.');
      router.refresh();
    } else {
      setErrorCopia(resultado.error ?? 'No se ha podido restaurar.');
    }
  }

  return (
    <>
      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Importar colección desde CSV</h2>
        <p className="text-sm text-texto-tenue">
          Columnas obligatorias: <code>nombre</code>, <code>marca</code>, <code>contextos</code>,{' '}
          <code>estaciones</code> y <code>momentos</code>. Las listas se separan con punto y coma.
          Se ve todo antes de confirmar.
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => leerFichero(e.target.files?.[0], setCsv)}
          className="text-sm"
          aria-label="Fichero CSV"
        />
        <textarea
          rows={4}
          placeholder="…o pega aquí el CSV"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button
          type="button"
          disabled={!csv.trim() || trabajando}
          onClick={previsualizar}
          className="boton-secundario w-full disabled:opacity-60"
        >
          Previsualizar
        </button>

        {previa ? (
          <div className="space-y-3 border-t border-borde pt-3">
            <p className="text-sm">
              <strong>{previa.filas.length}</strong> filas válidas
              {previa.errores.length > 0 ? ` · ${previa.errores.length} con error` : ''}
              {previa.duplicados.length > 0 ? ` · ${previa.duplicados.length} ya en colección` : ''}
            </p>

            {previa.errores.length > 0 ? (
              <ul className="space-y-1 text-sm text-id-nula">
                {previa.errores.slice(0, 10).map((e) => (
                  <li key={`${e.linea}-${e.motivo}`}>
                    Línea {e.linea}: {e.motivo}
                  </li>
                ))}
              </ul>
            ) : null}

            {previa.contextosDesconocidos.length > 0 ? (
              <p className="text-sm text-id-parcial">
                Contextos que no existen: {previa.contextosDesconocidos.join(', ')}. Créalos antes
                de importar, o corrige esas filas.
              </p>
            ) : null}
            {previa.cabecerasDesconocidas.length > 0 ? (
              <p className="text-sm text-texto-tenue">
                Columnas ignoradas: {previa.cabecerasDesconocidas.join(', ')}.
              </p>
            ) : null}

            {previa.filas.length > 0 ? (
              <div className="tabla-scroll">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <thead className="text-texto-tenue">
                    <tr>
                      <th className="py-1 pr-3">Nombre</th>
                      <th className="py-1 pr-3">Marca</th>
                      <th className="py-1 pr-3">Estado</th>
                      <th className="py-1">Contextos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.filas.slice(0, 8).map((f) => (
                      <tr key={`${f.nombre}-${f.marca}`} className="border-t border-borde">
                        <td className="py-1 pr-3">{f.nombre}</td>
                        <td className="py-1 pr-3">{f.marca}</td>
                        <td className="py-1 pr-3">{f.estado === 'LO_TENGO' ? 'Lo tengo' : 'Lo tuve'}</td>
                        <td className="py-1">{f.contextos.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previa.filas.length > 8 ? (
                  <p className="pt-1 text-xs text-texto-tenue">
                    …y {previa.filas.length - 8} más.
                  </p>
                ) : null}
              </div>
            ) : null}

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={omitirDuplicados}
                onChange={(e) => setOmitirDuplicados(e.target.checked)}
                className="h-5 w-5"
              />
              Omitir los que ya estén en la colección
            </label>

            <button
              type="button"
              disabled={previa.filas.length === 0 || trabajando}
              onClick={confirmarImportacion}
              className="boton-primario w-full disabled:opacity-60"
            >
              Importar {previa.filas.length} perfumes
            </button>
          </div>
        ) : null}

        {resumen ? <p className="text-sm text-id-total">{resumen}</p> : null}
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Restaurar copia JSON</h2>
        <p className="text-sm text-id-nula">
          Reemplaza toda tu colección y tu histórico por los de la copia. No se puede deshacer.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const fichero = e.target.files?.[0];
            if (!fichero) return;
            const json = await fichero.text();
            if (confirmacion !== 'RESTAURAR') {
              setErrorCopia('Escribe RESTAURAR en la casilla antes de elegir el fichero.');
              return;
            }
            await restaurar(json);
          }}
          className="text-sm"
          aria-label="Fichero de copia"
        />
        <div>
          <label htmlFor="confirmar">Escribe RESTAURAR para habilitarlo</label>
          <input
            id="confirmar"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            className="mt-1"
          />
        </div>
        {errorCopia ? <p className="text-sm text-id-nula">{errorCopia}</p> : null}
      </section>
    </>
  );
}
