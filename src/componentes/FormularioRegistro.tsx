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
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hoySegunElMovil, momentoSegunElMovil } from '@/cliente/fecha';
import { useRouter } from 'next/navigation';
import { PromediosEnLinea, formatearFecha } from './BloquePromedios';
import { DesgloseIdoneidad, InsigniaIdoneidad } from './Idoneidad';
import { descartarPendiente, encolarUso, motivoDelUltimoError } from '@/cliente/cola-offline';
import {
  accionBorrarUso,
  accionDescartarRecomendacion,
  accionReemplazarUso,
} from '@/app/acciones';
import { coincideBusqueda, MINIMO_CARACTERES_BUSQUEDA } from '@/dominio/texto';
import type { EjesIdoneidad, Momento, PromediosPerfume } from '@/dominio/tipos';

const MINIMO_BUSQUEDA = MINIMO_CARACTERES_BUSQUEDA;
const MAXIMO_RESULTADOS = 8;

export interface PerfumeBreve {
  id: string;
  nombre: string;
  marca: string;
  spraysHabituales?: number | null;
}

/** Un frasco de la coleccion con su clave de busqueda ya normalizada. */
export interface PerfumeBuscable extends PerfumeBreve {
  clave: string;
}

/** La sugerencia del motor para ahora, con su motivo en una linea. */
export interface SugerenciaDelDia {
  perfume: PerfumeBreve;
  motivo: string;
}

/**
 * Lo que se acaba de registrar, para poder deshacerlo o ajustarlo. Mientras
 * se guarda ya se enseña: con red lenta la pantalla no se queda muda.
 */
interface RegistroReciente {
  usoId: string;
  perfume: PerfumeBreve;
  momento: Momento;
  contextoId: string;
  fecha: string;
  estado: 'guardando' | 'guardado' | 'encolado';
}

/** El registro que se esta ajustando: se reemplaza al guardar, no antes. */
interface Edicion {
  usoId: string;
  encolado: boolean;
}

/** Un toque sobre algo que ya esta registrado ese dia: se pregunta antes. */
interface ToquePendiente {
  perfume: PerfumeBreve;
  momento: Momento;
  contextoId: string;
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

const AVISO_SIN_SESION =
  'Tu sesión ha caducado: guardado en el móvil. Vuelve a entrar y se enviará solo.';


export function FormularioRegistro({
  contextos,
  coleccion,
  recientes,
  ayer,
  hoy,
  momentoInicial,
  contextoPorMomento,
  registrados = [],
  sugerencias = [],
  toque,
  fechaFija,
}: {
  contextos: Contexto[];
  /**
   * La coleccion activa entera, para buscar en el propio movil: sin esperar a
   * la red y tambien sin conexion.
   */
  coleccion: PerfumeBuscable[];
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
  /** Perfumes ya registrados ese dia: se marcan y un toque pregunta antes de repetir. */
  registrados?: string[];
  /** Lo que propone el motor para ahora, en orden. «↻» pasa al siguiente. */
  sugerencias?: SugerenciaDelDia[];
  /**
   * Registro de un toque pedido desde fuera de la pantalla (atajo del icono,
   * pegatina NFC, ficha): 'ayer', 'sugerido' o el id de un perfume.
   */
  toque?: string;
  /**
   * Registro para un dia concreto (desde el calendario): todo lo que se guarde,
   * tambien con un toque, va a esa fecha y no a la de hoy.
   */
  fechaFija?: string;
}) {
  const router = useRouter();

  const [consulta, setConsulta] = useState('');
  const [elegido, setElegido] = useState<PerfumeBreve | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const contextoPorDefecto = (m: Momento) => contextoPorMomento[m] ?? contextos[0]?.id ?? '';

  const fechaInicial = fechaFija ?? hoy;
  const [fecha, setFecha] = useState(fechaInicial);
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
  const [editando, setEditando] = useState<Edicion | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<ToquePendiente | null>(null);
  const [indiceSugerencia, setIndiceSugerencia] = useState(0);
  // Lo registrado desde esta pantalla y aun no repintado (o en la cola).
  const [registradosAqui, setRegistradosAqui] = useState<string[]>([]);

  const cajaBusqueda = useRef<HTMLInputElement>(null);

  const yaRegistrados = useMemo(
    () => new Set([...registrados, ...registradosAqui]),
    [registrados, registradosAqui],
  );
  const sugerencia = sugerencias[indiceSugerencia] ?? null;

  // Al volver a la app se repinta si ha cambiado el dia o el momento: una PWA
  // abierta por la mañana y retomada por la tarde guardaria «Día».
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (hoySegunElMovil() !== hoy || momentoSegunElMovil() !== momentoInicial) router.refresh();
    };
    // Con una fecha fija no hay «hoy» que se quede viejo.
    if (fechaFija) return;
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [hoy, momentoInicial, fechaFija, router]);

  // Buscador en el propio movil: por palabras sueltas y en cualquier orden.
  const coincidencias = useMemo(() => {
    if (elegido || consulta.trim().length < MINIMO_BUSQUEDA) return [];
    return coleccion.filter((p) => coincideBusqueda(p.clave, consulta));
  }, [coleccion, consulta, elegido]);
  const resultados = coincidencias.slice(0, MAXIMO_RESULTADOS);

  // Al elegir perfume se enseñan sus promedios antes de rellenar nada mas.
  useEffect(() => {
    if (!elegido) {
      setResumen(null);
      return;
    }
    // Sin esperar a la red: la media de sprays ya viene con la coleccion.
    if (elegido.spraysHabituales != null) setSprays(String(elegido.spraysHabituales));
    let vigente = true;
    fetch(`/api/perfumes/${elegido.id}/resumen`)
      .then((r) => r.json())
      .then((datos: Resumen) => {
        if (!vigente) return;
        setResumen(datos);
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

    // El que se esta ajustando no cuenta como duplicado de si mismo.
    if (fecha === fechaInicial) {
      setDuplicado(!editando && yaRegistrados.has(elegido.id));
    } else {
      fetch(`/api/usos?perfumeId=${elegido.id}&fecha=${fecha}`)
        .then((r) => r.json())
        .then((datos) => vigente && setDuplicado(Boolean(datos.duplicado)))
        .catch(() => undefined);
    }

    return () => {
      vigente = false;
    };
  }, [elegido, fecha, fechaInicial, momento, contextoId, editando, yaRegistrados]);

  // El aviso de "Deshacer" se va solo: es una red, no un paso mas.
  useEffect(() => {
    if (!reciente || reciente.estado === 'guardando') return;
    const t = setTimeout(() => setReciente(null), SEGUNDOS_AVISO * 1000);
    return () => clearTimeout(t);
  }, [reciente]);

  // Registro pedido desde fuera (?toque=): una sola vez, aunque se recargue.
  const toqueHecho = useRef(false);
  useEffect(() => {
    if (!toque || toqueHecho.current) return;
    toqueHecho.current = true;
    router.replace(fechaFija ? `/mas/calendario/${fechaFija}` : '/', { scroll: false });
    const clave = `scentify:toque:${toque}:${fechaInicial}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, '1');
    } catch {
      // Sin sessionStorage, se registra igual: el aviso de duplicado protege.
    }

    const ctx = contextoPorDefecto(momentoInicial);
    let perfume: PerfumeBreve | null = null;
    if (toque === 'ayer') {
      if (ayer) {
        tocar(
          { id: ayer.perfumeId, nombre: ayer.nombre, marca: ayer.marca, spraysHabituales: ayer.sprays },
          ayer.momento,
          ayer.contextoId,
        );
      } else {
        setAviso('Ayer no registraste nada que repetir.');
      }
      return;
    }
    if (toque === 'sugerido') perfume = sugerencias[0]?.perfume ?? null;
    else perfume = coleccion.find((p) => p.id === toque) ?? null;

    if (!perfume) {
      setAviso(
        toque === 'sugerido'
          ? 'Hoy no hay nada que sugerir para ahora.'
          : 'Ese perfume no está en tu colección activa.',
      );
      return;
    }
    // Un enlace viejo o un atajo pulsado sin querer no apunta dos veces.
    if (yaRegistrados.has(perfume.id)) {
      setAviso(`Ya tienes ${perfume.nombre} registrado hoy.`);
      return;
    }
    void registrarAlToque(perfume, momentoInicial, ctx);
    // Solo al montar: el parametro se limpia de la URL al usarlo.
  }, []);

  const nombreContexto = (id: string) => contextos.find((c) => c.id === id)?.nombre ?? '';
  const textoMomento = (m: Momento) => (m === 'DIA' ? 'Día' : 'Noche');

  function cambiarMomento(m: Momento) {
    setMomento(m);
    if (!contextoTocado) setContextoId(contextoPorDefecto(m));
  }

  function elegirContexto(id: string) {
    setContextoId(id);
    setContextoTocado(true);
  }

  /** Un toque en un acceso rapido: si ya esta registrado ese dia, se pregunta. */
  function tocar(perfume: PerfumeBreve, m: Momento, ctx: string) {
    if (yaRegistrados.has(perfume.id)) {
      setPorConfirmar({ perfume, momento: m, contextoId: ctx });
      return;
    }
    void registrarAlToque(perfume, m, ctx);
  }

  /**
   * Registro de un toque desde los accesos rapidos: nada que rellenar. Si no
   * es lo que se queria, el aviso ofrece deshacerlo o ajustarlo.
   */
  async function registrarAlToque(perfume: PerfumeBreve, m: Momento, ctx: string) {
    if (!ctx || guardando) return;
    setGuardando(true);
    setAviso(null);
    setPorConfirmar(null);
    const usoId = crypto.randomUUID();
    const fechaUso = fechaFija ?? hoySegunElMovil();
    // El aviso sale ya, diciendo que se esta guardando.
    setReciente({ usoId, perfume, momento: m, contextoId: ctx, fecha: fechaUso, estado: 'guardando' });
    const resultado = await encolarUso({
      id: usoId,
      perfumeId: perfume.id,
      fecha: fechaUso,
      momento: m,
      contextoId: ctx,
      sprays: perfume.spraysHabituales ?? null,
      duracionPercibida: null,
      valoracionDia: null,
      comentario: null,
    });
    setGuardando(false);

    if (resultado === 'error') {
      setReciente(null);
      setAviso(textoDeError());
      return;
    }
    if (resultado === 'sin-sesion') setAviso(AVISO_SIN_SESION);
    setRegistradosAqui((r) => [...r, perfume.id]);
    setReciente({
      usoId,
      perfume,
      momento: m,
      contextoId: ctx,
      fecha: fechaUso,
      estado: resultado === 'guardado' ? 'guardado' : 'encolado',
    });
    if (resultado === 'guardado') router.refresh();
  }

  async function deshacer(): Promise<boolean> {
    const r = reciente;
    if (!r || r.estado === 'guardando') return false;
    setReciente(null);
    try {
      if (r.estado === 'encolado') {
        await descartarPendiente(r.usoId);
      } else {
        const datos = new FormData();
        datos.set('usoId', r.usoId);
        await accionBorrarUso(datos);
        router.refresh();
      }
    } catch {
      // Sin conexion el borrado no llega; se dice en vez de dar por hecho
      // que se ha deshecho.
      setAviso('No se ha podido deshacer: no hay conexión. El registro sigue guardado.');
      return false;
    }
    setRegistradosAqui((lista) => lista.filter((id) => id !== r.perfume.id));
    return true;
  }

  /**
   * "Ajustar": abre el formulario con lo mismo, SIN borrar nada. El registro
   * de antes solo se sustituye al pulsar «Guardar cambios»; «Cancelar» lo
   * deja como estaba.
   */
  function ajustar() {
    const r = reciente;
    if (!r || r.estado === 'guardando') return;
    setReciente(null);
    elegir(r.perfume);
    setEditando({ usoId: r.usoId, encolado: r.estado === 'encolado' });
    setFecha(r.fecha === hoySegunElMovil() ? fechaInicial : r.fecha);
    setMomento(r.momento);
    setContextoId(r.contextoId);
    setContextoTocado(true);
  }

  function elegir(perfume: PerfumeBreve) {
    setElegido(perfume);
    setConsulta('');
  }

  function repetirAyer() {
    if (!ayer) return;
    tocar(
      { id: ayer.perfumeId, nombre: ayer.nombre, marca: ayer.marca, spraysHabituales: ayer.sprays },
      ayer.momento,
      ayer.contextoId,
    );
  }

  /** «↻»: descarta la sugerencia por hoy, como «Otro» en Sugerir, y trae la siguiente. */
  function otraSugerencia() {
    if (!sugerencia) return;
    setIndiceSugerencia((i) => i + 1);
    const datos = new FormData();
    datos.set('perfumeId', sugerencia.perfume.id);
    datos.set('fecha', hoy);
    datos.set('momento', momentoInicial);
    datos.set('contextoId', contextoPorDefecto(momentoInicial));
    // Sin red el descarte no se guarda, pero en esta pantalla ya ha pasado al
    // siguiente: no merece un aviso.
    accionDescartarRecomendacion(datos).catch(() => undefined);
  }

  const spraysValidos = sprays === '' || (/^\d+$/.test(sprays) && Number(sprays) <= 100);

  async function guardar() {
    if (!elegido || !contextoId || guardando || !spraysValidos) return;
    setGuardando(true);
    setAviso(null);

    const uso = {
      id: crypto.randomUUID(),
      perfumeId: elegido.id,
      // Si no se ha tocado la fecha, es «hoy», y hoy es el de ahora.
      fecha: fecha === hoy ? hoySegunElMovil() : fecha,
      momento,
      contextoId,
      sprays: sprays === '' ? null : Number(sprays),
      duracionPercibida: duracion === '' ? null : duracion,
      valoracionDia: valoracion === '' ? null : Number(valoracion),
      comentario: comentario.trim() || null,
    };
    const confirmar = (estado: RegistroReciente['estado']) => {
      setReciente({
        usoId: uso.id,
        perfume: elegido,
        momento,
        contextoId,
        fecha: uso.fecha,
        estado,
      });
      setRegistradosAqui((r) => [...r, elegido.id]);
    };

    // Ajuste de un registro ya guardado: se sustituye en el servidor de una
    // vez. Sin red no se toca nada y el de antes sigue ahi.
    if (editando && !editando.encolado) {
      let respuesta: Awaited<ReturnType<typeof accionReemplazarUso>>;
      try {
        respuesta = await accionReemplazarUso(editando.usoId, uso);
      } catch {
        setGuardando(false);
        setAviso('Sin conexión: no se ha cambiado nada, el registro de antes sigue guardado.');
        return;
      }
      setGuardando(false);
      if (!respuesta.ok) {
        setAviso(respuesta.error);
        return;
      }
      reiniciar();
      confirmar('guardado');
      router.refresh();
      return;
    }

    // El que se ajusta aun estaba en la cola: se cambia ahi mismo.
    if (editando?.encolado) await descartarPendiente(editando.usoId).catch(() => undefined);

    const resultado = await encolarUso(uso);
    setGuardando(false);

    if (resultado === 'guardado') {
      reiniciar();
      confirmar('guardado');
      router.refresh();
    } else if (resultado === 'encolado') {
      reiniciar();
      confirmar('encolado');
    } else if (resultado === 'sin-sesion') {
      setAviso(AVISO_SIN_SESION);
      reiniciar();
      confirmar('encolado');
    } else {
      setAviso(textoDeError());
    }
  }

  function textoDeError(): string {
    const motivo = motivoDelUltimoError();
    if (motivo === 'Perfume no encontrado.') return 'Ese perfume ya no está en tu colección.';
    if (motivo === 'Contexto no encontrado.') return 'Ese contexto ya no existe. Elige otro.';
    return 'No se ha podido guardar. Revisa los datos e inténtalo otra vez.';
  }

  function reiniciar() {
    setElegido(null);
    setResumen(null);
    setPrevia(null);
    setDuplicado(false);
    setEditando(null);
    setSprays('');
    setDuracion('');
    setValoracion('');
    setComentario('');
    setMasCampos(false);
    setFecha(fechaInicial);
    setVerFecha(false);
    setMomento(momentoInicial);
    setContextoId(contextoPorDefecto(momentoInicial));
    setContextoTocado(false);
    cajaBusqueda.current?.blur();
  }

  const avisoReciente = reciente ? (
    <div className="aviso-flotante">
      <div className="min-w-0">
        <p className="truncate">
          {reciente.estado === 'guardando' ? (
            <span className="text-texto-tenue">Guardando… </span>
          ) : (
            <span className="text-id-total" aria-hidden="true">
              ✓{' '}
            </span>
          )}
          {reciente.perfume.nombre}
        </p>
        <p className="truncate text-xs text-texto-tenue">
          {reciente.estado === 'encolado' ? 'En el móvil, se enviará luego · ' : ''}
          {reciente.fecha !== hoy ? `${formatearFecha(reciente.fecha)} · ` : ''}
          {textoMomento(reciente.momento)} · {nombreContexto(reciente.contextoId)}
        </p>
      </div>
      {reciente.estado !== 'guardando' ? (
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={ajustar} className="boton-fantasma px-2 text-sm">
            Ajustar
          </button>
          <button
            type="button"
            onClick={() => void deshacer()}
            className="boton-fantasma px-2 text-sm text-acento"
          >
            Deshacer
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  // Los accesos rapidos, en un orden estable para que la mano aprenda donde
  // esta cada uno, y sin repetir lo que ya sale arriba.
  const idsDeArriba = new Set([ayer?.perfumeId, sugerencia?.perfume.id].filter(Boolean));
  const chips = [...recientes]
    .filter((p) => !idsDeArriba.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const ctxAhora = contextoPorDefecto(momentoInicial);
  const ayerDistinto =
    ayer && (ayer.momento !== momentoInicial || ayer.contextoId !== ctxAhora)
      ? ` · ${textoMomento(ayer.momento)} · ${nombreContexto(ayer.contextoId)}`
      : '';
  const hayAccesos = Boolean(sugerencia || ayer || chips.length > 0);
  const marca = (id: string) =>
    yaRegistrados.has(id) ? <span className="text-xs opacity-80">✓ {fechaFija ? 'ya' : 'hoy'}</span> : null;

  return (
    <section className="space-y-4">
      {/* Siempre montada: un lector de pantalla solo anuncia una region viva que ya existia. */}
      <div role="status" aria-live="polite">
        {avisoReciente}
      </div>
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
            <div className="space-y-1">
              <ul className="tarjeta divide-y divide-borde p-0">
                {resultados.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => elegir(p)} className="fila-toque">
                      <span className="nombre-perfume">{p.nombre}</span>
                      <span className="text-sm text-texto-tenue">{p.marca}</span>
                      {marca(p.id)}
                    </button>
                  </li>
                ))}
              </ul>
              {coincidencias.length > resultados.length ? (
                <p className="text-xs text-texto-tenue">
                  Y {coincidencias.length - resultados.length} más: escribe algo más para afinar.
                </p>
              ) : null}
            </div>
          ) : consulta.trim().length >= MINIMO_BUSQUEDA ? (
            <div className="tarjeta space-y-3 text-sm">
              <p>Nada con «{consulta.trim()}» en tu colección.</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/coleccion/nuevo?nombre=${encodeURIComponent(consulta.trim())}`}
                  className="boton-secundario px-4 text-sm"
                >
                  Añadirlo
                </Link>
                <Link href="/importar" className="boton-fantasma px-3 text-sm">
                  Desde Fragrantica
                </Link>
              </div>
            </div>
          ) : null}

          {porConfirmar ? (
            <div role="alert" className="aviso-atencion space-y-2">
              <p>
                Ya tienes {porConfirmar.perfume.nombre} registrado {fechaFija ? 'ese día' : 'hoy'}.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void registrarAlToque(
                      porConfirmar.perfume,
                      porConfirmar.momento,
                      porConfirmar.contextoId,
                    )
                  }
                  className="boton-secundario px-4 text-sm"
                >
                  Registrar otra vez
                </button>
                <button
                  type="button"
                  onClick={() => setPorConfirmar(null)}
                  className="boton-fantasma px-3 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {hayAccesos && consulta.length < MINIMO_BUSQUEDA ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="subtitulo">Un toque y listo</p>
                {/* Lo que se va a guardar, dicho antes de pulsar. */}
                <p className="text-xs text-texto-tenue">
                  {textoMomento(momentoInicial)} · {nombreContexto(ctxAhora)}
                </p>
              </div>

              {sugerencia ? (
                <div className="flex items-stretch border border-acento/60">
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => tocar(sugerencia.perfume, momentoInicial, ctxAhora)}
                    className="min-h-tactil min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-acento" aria-hidden="true">
                        ★
                      </span>
                      <span className="nombre-perfume truncate">{sugerencia.perfume.nombre}</span>
                      {marca(sugerencia.perfume.id)}
                    </span>
                    <span className="block text-xs text-texto-tenue">{sugerencia.motivo}</span>
                  </button>
                  <button
                    type="button"
                    onClick={otraSugerencia}
                    aria-label={`Otro: descartar ${sugerencia.perfume.nombre} por hoy`}
                    className="boton-fantasma border-l border-acento/30 px-4"
                  >
                    ↻
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {ayer ? (
                  <button
                    type="button"
                    onClick={repetirAyer}
                    disabled={guardando}
                    className="chip border-acento/60 text-acento"
                  >
                    ↺ {ayer.nombre}
                    <span className="text-xs opacity-80">como ayer{ayerDistinto}</span>
                    {marca(ayer.perfumeId)}
                  </button>
                ) : null}
                {chips.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={guardando}
                    onClick={() => tocar(p, momentoInicial, ctxAhora)}
                    className="chip"
                  >
                    {p.nombre}
                    {marca(p.id)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {aviso ? (
            <p role="alert" className="aviso-atencion">
              {aviso}
            </p>
          ) : null}
        </>
      ) : (
        <div className="space-y-5">
          <div className="tarjeta space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                {editando ? <p className="subtitulo">Ajustando el registro</p> : null}
                <p className="nombre-perfume text-xl">{elegido.nombre}</p>
                <p className="text-sm text-texto-tenue">{elegido.marca}</p>
              </div>
              {editando ? null : (
                <button type="button" onClick={reiniciar} className="boton-fantasma px-2 text-sm">
                  Cambiar
                </button>
              )}
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
                  {textoMomento(m)}
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
                step={1}
                value={sprays}
                onChange={(e) => setSprays(e.target.value)}
                placeholder={resumen?.spraysHabituales ? String(resumen.spraysHabituales) : 'opcional'}
                aria-invalid={!spraysValidos}
                aria-describedby={spraysValidos ? undefined : 'sprays-error'}
                className="mt-1"
              />
              {spraysValidos ? null : (
                <p id="sprays-error" className="mt-1 text-xs text-id-nula">
                  Un número entero entre 0 y 100.
                </p>
              )}
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
                    onChange={(e) => setFecha(e.target.value || fechaInicial)}
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
                    {fecha === hoy ? 'Hoy' : formatearFecha(fecha)}
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

          {/* Pegado encima de la barra inferior: siempre a mano del pulgar. El
              error va aqui dentro, donde se ve, y no tapado por la barra. */}
          <div className="barra-accion space-y-2">
            {aviso ? (
              <p role="alert" className="aviso-error">
                {aviso}
              </p>
            ) : null}
            <div className="flex gap-2">
              {editando ? (
                <button type="button" onClick={reiniciar} className="boton-secundario px-4">
                  Cancelar
                </button>
              ) : null}
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !contextoId || !spraysValidos}
                className="boton-primario flex-1"
              >
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar uso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
