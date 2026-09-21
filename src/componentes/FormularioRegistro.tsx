'use client';

/**
 * Seccion 6 — "Hoy estoy usando…".
 *
 * El objetivo es registrar en menos de diez segundos de pie con una mano, asi
 * que el camino corto es: acceso rapido -> guardar. Todo lo demas (duracion,
 * valoracion, comentario) esta plegado y se rellena por la noche desde el
 * historial.
 *
 * El envio va contra /api/usos con un id generado aqui: si no hay conexion, el
 * service worker lo encola y lo reenvia, y el mismo id evita duplicados.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BloquePromedios } from './BloquePromedios';
import { DesgloseIdoneidad, InsigniaIdoneidad } from './Idoneidad';
import { encolarUso } from '@/cliente/cola-offline';
import type { EjesIdoneidad, Momento, PromediosPerfume } from '@/dominio/tipos';

const MINIMO_BUSQUEDA = 3;

interface PerfumeBreve {
  id: string;
  nombre: string;
  marca: string;
}

interface Contexto {
  id: string;
  nombre: string;
}

interface Resumen extends PromediosPerfume {
  vecesUsado: number;
  ultimoUso: string | null;
}

interface Previsualizacion {
  idoneidad: { pct: number; detalle: EjesIdoneidad; explicacion: string };
  estacion: { explicacion: string; origen: string };
}

export function FormularioRegistro({
  contextos,
  recientes,
  ayer,
  hoy,
}: {
  contextos: Contexto[];
  recientes: PerfumeBreve[];
  ayer: { perfumeId: string; nombre: string; marca: string; momento: Momento; contextoId: string } | null;
  hoy: string;
}) {
  const router = useRouter();

  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<PerfumeBreve[]>([]);
  const [elegido, setElegido] = useState<PerfumeBreve | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const [fecha, setFecha] = useState(hoy);
  const [momento, setMomento] = useState<Momento>('DIA');
  const [contextoId, setContextoId] = useState(contextos[0]?.id ?? '');
  const [sprays, setSprays] = useState('');
  const [duracion, setDuracion] = useState('');
  const [valoracion, setValoracion] = useState('');
  const [comentario, setComentario] = useState('');
  const [masCampos, setMasCampos] = useState(false);

  const [previa, setPrevia] = useState<Previsualizacion | null>(null);
  const [duplicado, setDuplicado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cajaBusqueda = useRef<HTMLInputElement>(null);

  // Buscador: no molesta a la red hasta el tercer caracter.
  useEffect(() => {
    if (elegido || consulta.trim().length < MINIMO_BUSQUEDA) {
      setResultados([]);
      return;
    }
    const control = new AbortController();
    const temporizador = setTimeout(async () => {
      try {
        const r = await fetch(`/api/buscar?q=${encodeURIComponent(consulta)}`, {
          signal: control.signal,
        });
        const datos = await r.json();
        setResultados(datos.resultados ?? []);
      } catch {
        // Sin conexion no hay busqueda; los accesos rapidos siguen ahi.
      }
    }, 180);
    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [consulta, elegido]);

  // Al elegir perfume se enseñan sus promedios antes de rellenar nada mas.
  useEffect(() => {
    if (!elegido) {
      setResumen(null);
      return;
    }
    let vigente = true;
    fetch(`/api/perfumes/${elegido.id}/resumen`)
      .then((r) => r.json())
      .then((datos: Resumen) => {
        if (!vigente) return;
        setResumen(datos);
        // Los sprays se prerrellenan con la media historica.
        if (datos.spraysHabituales !== null) setSprays(String(datos.spraysHabituales));
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [elegido]);

  // Idoneidad en vivo y aviso de duplicado.
  useEffect(() => {
    if (!elegido || !contextoId) {
      setPrevia(null);
      return;
    }
    const parametros = new URLSearchParams({
      perfumeId: elegido.id,
      fecha,
      momento,
      contextoId,
    });
    let vigente = true;
    fetch(`/api/idoneidad?${parametros}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((datos) => vigente && setPrevia(datos))
      .catch(() => vigente && setPrevia(null));

    fetch(`/api/usos?perfumeId=${elegido.id}&fecha=${fecha}`)
      .then((r) => r.json())
      .then((datos) => vigente && setDuplicado(Boolean(datos.duplicado)))
      .catch(() => undefined);

    return () => {
      vigente = false;
    };
  }, [elegido, fecha, momento, contextoId]);

  function elegir(perfume: PerfumeBreve) {
    setElegido(perfume);
    setConsulta('');
    setResultados([]);
  }

  function repetirAyer() {
    if (!ayer) return;
    elegir({ id: ayer.perfumeId, nombre: ayer.nombre, marca: ayer.marca });
    setMomento(ayer.momento);
    setContextoId(ayer.contextoId);
  }

  async function guardar() {
    if (!elegido || !contextoId || guardando) return;
    setGuardando(true);
    setAviso(null);

    const uso = {
      id: crypto.randomUUID(),
      perfumeId: elegido.id,
      fecha,
      momento,
      contextoId,
      sprays: sprays === '' ? null : Number(sprays),
      duracionPercibida: duracion === '' ? null : duracion,
      valoracionDia: valoracion === '' ? null : Number(valoracion),
      comentario: comentario.trim() || null,
    };

    const resultado = await encolarUso(uso);
    setGuardando(false);

    if (resultado === 'guardado') {
      reiniciar();
      router.refresh();
    } else if (resultado === 'encolado') {
      setAviso('Sin conexión: guardado en el móvil, se enviará solo al volver la cobertura.');
      reiniciar();
    } else {
      setAviso('No se ha podido guardar. Inténtalo otra vez.');
    }
  }

  function reiniciar() {
    setElegido(null);
    setResumen(null);
    setPrevia(null);
    setDuplicado(false);
    setSprays('');
    setDuracion('');
    setValoracion('');
    setComentario('');
    setMasCampos(false);
    cajaBusqueda.current?.blur();
  }

  return (
    <section className="space-y-4">
      {!elegido ? (
        <>
          <div>
            <label htmlFor="buscador">¿Qué te has puesto?</label>
            <input
              id="buscador"
              ref={cajaBusqueda}
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Nombre o marca…"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              className="mt-1"
            />
          </div>

          {resultados.length > 0 ? (
            <ul className="tarjeta divide-y divide-borde p-0">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => elegir(p)} className="fila-toque">
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="text-sm text-texto-tenue">{p.marca}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {(recientes.length > 0 || ayer) && consulta.length < MINIMO_BUSQUEDA ? (
            <div className="space-y-2">
              <p className="text-sm text-texto-tenue">Accesos rápidos</p>
              <div className="flex flex-wrap gap-2">
                {ayer ? (
                  <button type="button" onClick={repetirAyer} className="etiqueta border-ambar/50 text-ambar">
                    ↺ Repetir el de ayer
                  </button>
                ) : null}
                {recientes.map((p) => (
                  <button key={p.id} type="button" onClick={() => elegir(p)} className="etiqueta">
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-4">
          <div className="tarjeta space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{elegido.nombre}</p>
                <p className="text-sm text-texto-tenue">{elegido.marca}</p>
              </div>
              <button type="button" onClick={reiniciar} className="boton-fantasma px-2 text-sm">
                Cambiar
              </button>
            </div>
            {resumen ? (
              <BloquePromedios
                promedios={resumen}
                vecesUsado={resumen.vecesUsado}
                ultimoUso={resumen.ultimoUso}
              />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fecha">Fecha</label>
              {/* Editable hacia atras; no se permite el futuro. */}
              <input
                id="fecha"
                type="date"
                value={fecha}
                max={hoy}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <span className="block text-sm font-medium text-texto-tenue">Momento</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(['DIA', 'NOCHE'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={momento === m}
                    onClick={() => setMomento(m)}
                    className={`boton px-2 text-sm ${
                      momento === m ? 'bg-ambar text-fondo' : 'border border-borde bg-superficie'
                    }`}
                  >
                    {m === 'DIA' ? 'Día' : 'Noche'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-texto-tenue">Contexto</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {contextos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={contextoId === c.id}
                  onClick={() => setContextoId(c.id)}
                  className={`etiqueta ${
                    contextoId === c.id ? 'border-ambar bg-ambar/15 text-ambar' : ''
                  }`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="sprays">Sprays</label>
            <input
              id="sprays"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={sprays}
              onChange={(e) => setSprays(e.target.value)}
              placeholder={resumen?.spraysHabituales ? String(resumen.spraysHabituales) : 'opcional'}
              className="mt-1"
            />
          </div>

          {previa ? (
            <div className="tarjeta space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-texto-tenue">Idoneidad</span>
                <InsigniaIdoneidad pct={previa.idoneidad.pct} />
              </div>
              <DesgloseIdoneidad
                detalle={previa.idoneidad.detalle}
                explicacion={previa.idoneidad.explicacion}
              />
              <p className="text-xs text-texto-tenue">{previa.estacion.explicacion}</p>
            </div>
          ) : null}

          {duplicado ? (
            <p className="rounded-xl border border-id-parcial/40 bg-id-parcial/10 px-4 py-3 text-sm text-id-parcial">
              Ya tienes este perfume registrado en esta fecha. Puedes guardarlo igual.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setMasCampos((v) => !v)}
            className="boton-fantasma w-full justify-between px-1 text-sm"
            aria-expanded={masCampos}
          >
            Duración, valoración y comentario
            <span aria-hidden="true">{masCampos ? '−' : '+'}</span>
          </button>

          {masCampos ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="duracion">Duración percibida</label>
                <select
                  id="duracion"
                  value={duracion}
                  onChange={(e) => setDuracion(e.target.value)}
                  className="mt-1"
                >
                  <option value="">Sin indicar</option>
                  <option value="MENOS_2H">Menos de 2h</option>
                  <option value="DE_2_4H">2-4h</option>
                  <option value="DE_4_6H">4-6h</option>
                  <option value="DE_6_8H">6-8h</option>
                  <option value="MAS_8H">Más de 8h</option>
                </select>
              </div>
              <div>
                <span className="block text-sm font-medium text-texto-tenue">Valoración del día</span>
                <div className="mt-1 flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={valoracion === String(n)}
                      onClick={() => setValoracion(valoracion === String(n) ? '' : String(n))}
                      className={`boton flex-1 px-0 ${
                        Number(valoracion) >= n ? 'bg-ambar text-fondo' : 'border border-borde'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="comentario">Comentario</label>
                <textarea
                  id="comentario"
                  rows={3}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          ) : null}

          {aviso ? (
            <p className="rounded-xl border border-borde bg-superficie-alta px-4 py-3 text-sm">
              {aviso}
            </p>
          ) : null}

          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !contextoId}
            className="boton-primario w-full disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Registrar uso'}
          </button>
        </div>
      )}
    </section>
  );
}
