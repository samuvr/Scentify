'use client';

/**
 * Seccion 6 — "Hoy estoy usando…".
 *
 * El objetivo es registrar en menos de diez segundos de pie con una mano, asi
 * que el camino corto es UN toque: un acceso rapido registra directamente con
 * el momento de ahora, el contexto habitual y la media de sprays, y deja un
 * aviso con "Deshacer" y "Ajustar". El formulario completo queda para cuando
 * se busca un perfume o se quiere cambiar algo; y aun ahi la duracion, la
 * valoracion y el comentario estan plegados y se rellenan por la noche.
 *
 * El envio va contra /api/usos con un id generado aqui: si no hay conexion, el
 * service worker lo encola y lo reenvia, y el mismo id evita duplicados.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PromediosEnLinea, formatearFecha } from './BloquePromedios';
import { DesgloseIdoneidad, InsigniaIdoneidad } from './Idoneidad';
import { descartarPendiente, encolarUso } from '@/cliente/cola-offline';
import { accionBorrarUso } from '@/app/acciones';
import type { EjesIdoneidad, Momento, PromediosPerfume } from '@/dominio/tipos';

const MINIMO_BUSQUEDA = 3;

interface PerfumeBreve {
  id: string;
  nombre: string;
  marca: string;
  spraysHabituales?: number | null;
}

/** Lo que se acaba de registrar de un toque, para poder deshacerlo. */
interface RegistroReciente {
  usoId: string;
  perfume: PerfumeBreve;
  momento: Momento;
  contextoId: string;
  encolado: boolean;
}

const SEGUNDOS_AVISO = 8;

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
  momentoInicial,
  contextoPorMomento,
}: {
  contextos: Contexto[];
  recientes: PerfumeBreve[];
  ayer: {
    perfumeId: string;
    nombre: string;
    marca: string;
    momento: Momento;
    contextoId: string;
    sprays: number | null;
  } | null;
  hoy: string;
  /** El que toca por la hora: de noche a partir de las 18:00. */
  momentoInicial: Momento;
  /** Contexto habitual de cada momento en este tipo de dia (laborable o finde). */
  contextoPorMomento: Record<Momento, string | null>;
}) {
  const router = useRouter();

  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<PerfumeBreve[]>([]);
  const [elegido, setElegido] = useState<PerfumeBreve | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const contextoPorDefecto = (m: Momento) => contextoPorMomento[m] ?? contextos[0]?.id ?? '';

  const [fecha, setFecha] = useState(hoy);
  const [verFecha, setVerFecha] = useState(false);
  const [momento, setMomento] = useState<Momento>(momentoInicial);
  const [contextoId, setContextoId] = useState(contextoPorDefecto(momentoInicial));
  // Mientras no se toque el contexto a mano, sigue al momento: cambiar a Noche
  // propone el contexto habitual de la noche.
  const [contextoTocado, setContextoTocado] = useState(false);
  const [sprays, setSprays] = useState('');
  const [duracion, setDuracion] = useState('');
  const [valoracion, setValoracion] = useState('');
  const [comentario, setComentario] = useState('');
  const [masCampos, setMasCampos] = useState(false);

  const [previa, setPrevia] = useState<Previsualizacion | null>(null);
  const [duplicado, setDuplicado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reciente, setReciente] = useState<RegistroReciente | null>(null);

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

  // El aviso de "Deshacer" se va solo: es una red, no un paso mas.
  useEffect(() => {
    if (!reciente) return;
    const t = setTimeout(() => setReciente(null), SEGUNDOS_AVISO * 1000);
    return () => clearTimeout(t);
  }, [reciente]);

  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '';

  function cambiarMomento(m: Momento) {
    setMomento(m);
    if (!contextoTocado) setContextoId(contextoPorDefecto(m));
  }

  function elegirContexto(id: string) {
    setContextoId(id);
    setContextoTocado(true);
  }

  /**
   * Registro de un toque desde los accesos rapidos: nada que rellenar. Si no
   * es lo que se queria, el aviso ofrece deshacerlo o abrir el formulario.
   */
  async function registrarAlToque(perfume: PerfumeBreve, m: Momento, ctx: string) {
    if (!ctx || guardando) return;
    setGuardando(true);
    setAviso(null);
    const usoId = crypto.randomUUID();
    const resultado = await encolarUso({
      id: usoId,
      perfumeId: perfume.id,
      fecha: hoy,
      momento: m,
      contextoId: ctx,
      sprays: perfume.spraysHabituales ?? null,
      duracionPercibida: null,
      valoracionDia: null,
      comentario: null,
    });
    setGuardando(false);

    if (resultado === 'error') {
      setAviso('No se ha podido guardar. Inténtalo otra vez.');
      return;
    }
    setReciente({ usoId, perfume, momento: m, contextoId: ctx, encolado: resultado === 'encolado' });
    if (resultado === 'guardado') router.refresh();
  }

  async function deshacer(): Promise<RegistroReciente | null> {
    const r = reciente;
    if (!r) return null;
    setReciente(null);
    if (r.encolado) {
      await descartarPendiente(r.usoId);
    } else {
      const datos = new FormData();
      datos.set('usoId', r.usoId);
      await accionBorrarUso(datos);
      router.refresh();
    }
    return r;
  }

  /** "Ajustar": deshace el registro de un toque y abre el formulario con lo mismo. */
  async function ajustar() {
    const r = await deshacer();
    if (!r) return;
    elegir(r.perfume);
    setMomento(r.momento);
    setContextoId(r.contextoId);
    setContextoTocado(true);
  }

  function elegir(perfume: PerfumeBreve) {
    setElegido(perfume);
    setConsulta('');
    setResultados([]);
  }

  function repetirAyer() {
    if (!ayer) return;
    void registrarAlToque(
      { id: ayer.perfumeId, nombre: ayer.nombre, marca: ayer.marca, spraysHabituales: ayer.sprays },
      ayer.momento,
      ayer.contextoId,
    );
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
    setFecha(hoy);
    setVerFecha(false);
    setMomento(momentoInicial);
    setContextoId(contextoPorDefecto(momentoInicial));
    setContextoTocado(false);
    cajaBusqueda.current?.blur();
  }

  const avisoReciente = reciente ? (
    <div role="status" className="aviso-flotante">
      <div className="min-w-0">
        <p className="truncate">
          <span className="text-id-total" aria-hidden="true">✓ </span>
          {reciente.perfume.nombre}
        </p>
        <p className="truncate text-xs text-texto-tenue">
          {reciente.encolado ? 'Sin conexión, se enviará luego · ' : ''}
          {reciente.momento === 'DIA' ? 'Día' : 'Noche'} · {nombreContexto(reciente.contextoId)}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={ajustar} className="boton-fantasma px-2 text-sm">
          Ajustar
        </button>
        <button type="button" onClick={deshacer} className="boton-fantasma px-2 text-sm text-acento">
          Deshacer
        </button>
      </div>
    </div>
  ) : null;

  return (
    <section className="space-y-4">
      {avisoReciente}
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
                    <span className="nombre-perfume">{p.nombre}</span>
                    <span className="text-sm text-texto-tenue">{p.marca}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {(recientes.length > 0 || ayer) && consulta.length < MINIMO_BUSQUEDA ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="subtitulo">Un toque y listo</p>
                {/* Lo que se va a guardar, dicho antes de pulsar. */}
                <p className="text-xs text-texto-tenue">
                  {momentoInicial === 'DIA' ? 'Día' : 'Noche'} ·{' '}
                  {nombreContexto(contextoPorDefecto(momentoInicial))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ayer ? (
                  <button type="button" onClick={repetirAyer} disabled={guardando} className="chip border-acento/60 text-acento">
                    ↺ Repetir el de ayer
                  </button>
                ) : null}
                {recientes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={guardando}
                    onClick={() => registrarAlToque(p, momentoInicial, contextoPorDefecto(momentoInicial))}
                    className="chip"
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {aviso ? <p className="aviso-atencion">{aviso}</p> : null}
        </>
      ) : (
        <div className="space-y-5">
          <div className="tarjeta space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="nombre-perfume text-xl">{elegido.nombre}</p>
                <p className="text-sm text-texto-tenue">{elegido.marca}</p>
              </div>
              <button type="button" onClick={reiniciar} className="boton-fantasma px-2 text-sm">
                Cambiar
              </button>
            </div>
            {/* Los promedios en una linea: aqui importan, pero no deben empujar el formulario. */}
            {resumen ? (
              <div className="space-y-0.5">
                <p className="text-sm text-texto-tenue">
                  {resumen.vecesUsado > 0
                    ? `${resumen.vecesUsado} ${resumen.vecesUsado === 1 ? 'uso' : 'usos'}`
                    : 'Todavía no lo has usado'}
                  {resumen.ultimoUso ? ` · último ${formatearFecha(resumen.ultimoUso)}` : ''}
                </p>
                <PromediosEnLinea promedios={resumen} />
              </div>
            ) : null}
          </div>

          <div>
            <span className="block text-sm font-medium text-texto-tenue">Momento</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['DIA', 'NOCHE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={momento === m}
                  onClick={() => cambiarMomento(m)}
                  className="opcion"
                >
                  {m === 'DIA' ? 'Día' : 'Noche'}
                </button>
              ))}
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
                  onClick={() => elegirContexto(c.id)}
                  className="chip"
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div>
              {/* Casi siempre es hoy: la fecha se pliega y se abre si hace falta. */}
              {verFecha ? (
                <>
                  <label htmlFor="fecha">Fecha</label>
                  <input
                    id="fecha"
                    type="date"
                    value={fecha}
                    max={hoy}
                    onChange={(e) => setFecha(e.target.value || hoy)}
                    className="mt-1"
                  />
                </>
              ) : (
                <>
                  <span className="block text-sm font-medium text-texto-tenue">Fecha</span>
                  <button
                    type="button"
                    onClick={() => setVerFecha(true)}
                    className="opcion mt-1 w-full justify-between font-normal"
                  >
                    Hoy
                    <span className="text-sm text-texto-tenue">Cambiar</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {previa ? (
            <div className="tarjeta space-y-2">
              <div className="flex items-center justify-between">
                <span className="subtitulo">Idoneidad</span>
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
            <p className="aviso-atencion">
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
                      aria-label={`${n} de 5`}
                      aria-pressed={valoracion === String(n)}
                      data-activo={Number(valoracion) >= n}
                      onClick={() => setValoracion(valoracion === String(n) ? '' : String(n))}
                      className="opcion flex-1 px-0"
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

          {aviso ? <p className="aviso-atencion">{aviso}</p> : null}

          {/* Pegado encima de la barra inferior: siempre a mano del pulgar. */}
          <div className="barra-accion">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || !contextoId}
              className="boton-primario w-full"
            >
              {guardando ? 'Guardando…' : 'Registrar uso'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
