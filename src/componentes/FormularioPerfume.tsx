'use client';

/**
 * Seccion 4.1 — Alta y edicion en pasos, optimizada para movil.
 *
 * Un paso por pantalla, una columna, botones grandes. El paso 2 es el
 * enriquecimiento con Fragrantica: si falla, se sigue a mano SIN perder lo ya
 * escrito (criterio de aceptacion 2), porque el estado vive aqui y la consulta
 * solo añade sugerencias encima.
 *
 * Los votos que llegan de Fragrantica se pintan junto a cada casilla y mueren
 * aqui: lo que se envia al servidor son unicamente mis selecciones (5.3). La
 * excepcion es «Esta fragancia me recuerda a», que se guarda en la ficha para
 * enseñarlo alli.
 *
 * La ficha (nombre, marca, notas, familias, concentracion, anio) es comun a
 * todas las cuentas. Al escribir el nombre se busca en ese catalogo, y elegir
 * una ficha rellena todo eso de golpe: solo queda lo personal.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { accionGuardarPerfume, type RespuestaPerfume } from '@/app/acciones';
import type { Estacion, Momento } from '@/dominio/tipos';
import { familiasDeAcordes } from '@/dominio/familias';
import { urlDeFichaEn, type FichaFragrantica, type VotoEje } from '@/dominio/fragrantica';
import { masVotadas } from '@/dominio/votos';
import type { FichaParaAlta } from '@/servicios/consultas';
import { contextosQueEncajan, type SugerenciaContextos } from '@/dominio/sugerencia-contextos';
import { VALORES_VACIOS, type Nivel, type ValoresPerfume } from '@/componentes/valores-perfume';
import { ParecidosFragrantica } from '@/componentes/ParecidosFragrantica';

const NIVELES: { clave: Nivel; titulo: string }[] = [
  { clave: 'SALIDA', titulo: 'Salida' },
  { clave: 'CORAZON', titulo: 'Corazón' },
  { clave: 'FONDO', titulo: 'Fondo' },
];

const ESTACIONES: { clave: Estacion; nombre: string }[] = [
  { clave: 'PRIMAVERA', nombre: 'Primavera' },
  { clave: 'VERANO', nombre: 'Verano' },
  { clave: 'OTONO', nombre: 'Otoño' },
  { clave: 'INVIERNO', nombre: 'Invierno' },
];

/** Primer paso que es solo mio: lo anterior viene hecho con la ficha. */
const PRIMER_PASO_PERSONAL = 4;

interface ResultadoCatalogo {
  id: string;
  nombre: string;
  marca: string;
  concentracion: string | null;
  anioLanzamiento: number | null;
  miPerfumeId: string | null;
  personas: number;
}

const PASOS = [
  'Nombre y marca',
  'Fragrantica',
  'Notas',
  'Familias',
  'Estaciones',
  'Momento',
  'Contextos',
  'Inventario',
] as const;

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

/**
 * Los acordes de Fragrantica bajo las familias: cuales se han marcado y cuales
 * no tienen familia en Scentify, para que se vea por que falta algo.
 */
function AcordesDeFragrantica({
  acordes,
  familias,
}: {
  acordes: string[];
  familias: { id: string; slug: string; nombre: string }[];
}) {
  const sinFamilia = acordes.filter((a) => familiasDeAcordes([a], familias).length === 0);
  return (
    <div className="space-y-1 text-xs text-texto-tenue">
      <p>Acordes en Fragrantica: {acordes.join(', ')}.</p>
      <p>
        Se marcan solas las familias que coinciden.
        {sinFamilia.length > 0 ? ` Sin familia en Scentify: ${sinFamilia.join(', ')}.` : ''}
      </p>
    </div>
  );
}

/**
 * La ficha se ha leido pero sin los votos de este eje: se dice, para que no
 * parezca que faltan las barras por un fallo de la pantalla.
 */
function SinVotos({ ficha, eje }: { ficha: FichaFragrantica | null; eje: 'estaciones' | 'momentos' }) {
  if (!ficha || ficha[eje]) return null;
  return (
    <p className="text-xs text-texto-tenue">
      La lectura de Fragrantica no ha traído los votos de {eje === 'estaciones' ? 'estación' : 'día y noche'}.
    </p>
  );
}

/** Barra de apoyo con el voto de Fragrantica. Solo visual: no decide nada. */
function BarraVoto({ voto }: { voto: VotoEje | undefined }) {
  if (!voto) return null;
  return (
    // Hereda el color de la fila: sobre la fila elegida (relleno de acento)
    // un gris tenue no se leeria.
    <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-normal opacity-80">
      <span className="inline-block h-2 w-12 overflow-hidden border border-current">
        <span className="block h-full bg-current" style={{ width: `${voto.pct}%` }} />
      </span>
      {voto.pct}%{voto.votos !== null ? ` · ${voto.votos}` : ''}
    </span>
  );
}

/**
 * «Marcar según Fragrantica»: pone de golpe las casillas que los votos dicen
 * claro. Es una propuesta que se ve marcada y se cambia a mano; no aparece si
 * no hay votos o si ya esta marcado justo eso.
 */
function MarcarSegunVotos<C extends string>({
  propuesta,
  actual,
  aplicar,
  etiqueta = 'Marcar según Fragrantica',
}: {
  propuesta: C[];
  actual: C[];
  aplicar: (seleccion: C[]) => void;
  etiqueta?: string;
}) {
  const yaEsta =
    propuesta.length === actual.length && propuesta.every((clave) => actual.includes(clave));
  if (propuesta.length === 0 || yaEsta) return null;
  return (
    <button type="button" onClick={() => aplicar(propuesta)} className="boton-secundario w-full text-sm">
      {etiqueta}
    </button>
  );
}

export function FormularioPerfume({
  perfumeId,
  iniciales,
  contextos,
  familias,
  notasConocidas,
  fichaInicial,
  fichaCatalogo,
  compartidaCon = 0,
  sugerirConIa = false,
  consultarAlAbrir = false,
  deseoId,
}: {
  perfumeId?: string;
  /** Alta desde «Convertir en colección»: al guardar, el deseo sale de la wishlist. */
  deseoId?: string;
  /**
   * Al editar, «Volver a consultar Fragrantica»: abre en ese paso y lanza la
   * consulta con la direccion guardada, en vez de dejar en el paso 1.
   */
  consultarAlAbrir?: boolean;
  iniciales?: ValoresPerfume;
  /**
   * Ficha del catalogo que ya encaja con lo que llega, p. ej. la misma URL de
   * Fragrantica compartida desde el movil. Se usa directamente.
   */
  fichaCatalogo?: FichaParaAlta | null;
  /** Al editar: cuantas personas mas tienen este perfume y veran la ficha. */
  compartidaCon?: number;
  /** Hay clave de Claude: se pueden pedir contextos sugeridos. */
  sugerirConIa?: boolean;
  /**
   * Ficha ya leida en el servidor, cuando se comparte el texto de la pagina
   * desde el movil. Llega parseada para no tener que mandar los 17 kB de
   * texto hasta el navegador solo para volver a analizarlos aqui.
   */
  fichaInicial?: FichaFragrantica | null;
  contextos: { id: string; nombre: string }[];
  familias: { id: string; slug: string; nombre: string }[];
  notasConocidas: string[];
}) {
  const router = useRouter();
  /**
   * Llegando por «Compartir → Scentify» la URL ya viene puesta, y con ella el
   * nombre y la marca sacados de la propia direccion. Empezar en el paso 1
   * seria pedir lo que ya se tiene, asi que se salta al de Fragrantica.
   */
  const compartida = !perfumeId && Boolean(iniciales?.fragranticaUrl || fichaInicial);
  const [paso, setPaso] = useState(
    fichaCatalogo ? PRIMER_PASO_PERSONAL : compartida || consultarAlAbrir ? 1 : 0,
  );
  /**
   * Con la ficha ya hecha —leida de Fragrantica o elegida del catalogo— ir
   * paso a paso es pulsar «Siguiente» sobre cosas ya rellenas. La revision
   * lo pone todo en una pantalla: lo comun resumido, a la vista solo lo que
   * hay que decidir, y el inventario plegado. Los pasos siguen ahi para
   * corregir lo que haga falta.
   */
  // Al editar tambien: cambiar un contexto eran siete toques de «Siguiente».
  const [modo, setModo] = useState<'pasos' | 'revision'>(
    perfumeId
      ? consultarAlAbrir
        ? 'pasos'
        : 'revision'
      : fichaCatalogo || fichaInicial
        ? 'revision'
        : 'pasos',
  );
  const [v, setV] = useState<ValoresPerfume>(() =>
    fichaCatalogo ? conFicha(iniciales ?? VALORES_VACIOS, fichaCatalogo) : (iniciales ?? VALORES_VACIOS),
  );
  const [fichaId, setFichaId] = useState<string | null>(fichaCatalogo?.id ?? null);
  const [catalogo, setCatalogo] = useState<ResultadoCatalogo[]>([]);
  const [cargandoFicha, setCargandoFicha] = useState(false);
  const [ficha, setFicha] = useState<FichaFragrantica | null>(null);
  const [avisoFragrantica, setAvisoFragrantica] = useState<string | null>(null);
  const [textoPegado, setTextoPegado] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [enlace, setEnlace] = useState('');
  const [errorEnlace, setErrorEnlace] = useState<string | null>(null);
  const [abriendoEnlace, abrirConTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** El frasco que ya tengo de este perfume, si el servidor lo ha encontrado. */
  const [duplicadoDe, setDuplicadoDe] = useState<string | null>(null);
  const [sugerencia, setSugerencia] = useState<SugerenciaContextos | null>(null);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [avisoSugerencia, setAvisoSugerencia] = useState<string | null>(null);
  const sugerenciaPedida = useRef(false);

  const cambiar = (parcial: Partial<ValoresPerfume>) => setV((previo) => ({ ...previo, ...parcial }));

  /** Lo escrito en cada campo de nota y aun no añadido. */
  const [pendientes, setPendientes] = useState<Record<Nivel, string>>({
    SALIDA: '',
    CORAZON: '',
    FONDO: '',
  });

  /** «Bergamota, Pimienta rosa, Oud» son tres notas, no una. */
  const partirNotas = (texto: string) =>
    texto
      .split(/[,;\n]/)
      .map((n) => n.trim())
      .filter(Boolean);

  function añadirNotas(nivel: Nivel) {
    const nuevas = partirNotas(pendientes[nivel]);
    setPendientes((p) => ({ ...p, [nivel]: '' }));
    if (nuevas.length === 0) return;
    setV((previo) => ({
      ...previo,
      notas: [...previo.notas, ...nuevas.map((nombre) => ({ nombre, nivel }))],
    }));
  }

  /** Las notas con lo que quede escrito sin añadir, para guardar. */
  function conNotasPendientes() {
    const extra = NIVELES.flatMap(({ clave }) =>
      partirNotas(pendientes[clave]).map((nombre) => ({ nombre, nivel: clave })),
    );
    if (extra.length === 0) return v.notas;
    const todas = [...v.notas, ...extra];
    setV((previo) => ({ ...previo, notas: todas }));
    setPendientes({ SALIDA: '', CORAZON: '', FONDO: '' });
    return todas;
  }

  /*
   * Aviso al salir con cambios sin guardar. Al editar, cerrar o recargar la
   * pestaña tiraba lo cambiado sin decir nada.
   */
  const inicial = useRef(JSON.stringify(v));
  const sinCambios = useRef(true);
  useEffect(() => {
    sinCambios.current = JSON.stringify(v) === inicial.current;
  }, [v]);
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (sinCambios.current) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, []);

  /**
   * Y se intenta leer la ficha sola, que es lo que se espera al compartir. El
   * ref evita repetirlo: sin el, cada render volveria a lanzar la peticion.
   * Si falla, el aviso y el cuadro de pegar el texto aparecen igual que
   * cuando se pulsa el boton a mano.
   */
  const yaConsultada = useRef(false);
  useEffect(() => {
    if (consultarAlAbrir && !yaConsultada.current && iniciales?.fragranticaUrl) {
      yaConsultada.current = true;
      void consultarFragrantica({ url: iniciales.fragranticaUrl });
      return;
    }
    if (!compartida || yaConsultada.current) return;
    yaConsultada.current = true;
    // Ya estaba en el catalogo: la ficha esta hecha y no hace falta leer nada.
    // Del texto compartido solo interesan los votos, que acompañan las
    // casillas de estaciones y momentos.
    if (fichaCatalogo) {
      if (fichaInicial) setFicha(fichaInicial);
      return;
    }
    // Si el texto compartido ya venia leido, no hay nada que pedir: se aplica
    // y se acabo. Solo se consulta cuando lo unico que hay es la direccion.
    if (fichaInicial) {
      aplicarFicha(fichaInicial);
      return;
    }
    void consultarFragrantica({ url: iniciales?.fragranticaUrl ?? '' });
    // Solo al montar: `compartida` se calcula de los valores iniciales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * El enlace pegado al empezar un alta. Se vuelve a la pagina con la URL,
   * igual que al compartir desde el movil: el servidor mira si la ficha ya
   * esta en el catalogo, saca el nombre y la marca de la direccion, y el
   * formulario se abre leyendo la ficha.
   */
  function abrirEnlace(texto: string, avisar = true) {
    const url = urlDeFichaEn([texto]);
    if (!url) {
      if (avisar) {
        setErrorEnlace('Ese enlace no es de una ficha: tiene que ser de fragrantica.es/perfume/… o .com.');
      }
      return;
    }
    setErrorEnlace(null);
    const parametros = new URLSearchParams({ url });
    if (deseoId) parametros.set('deseo', deseoId);
    abrirConTransicion(() => router.push(`/coleccion/nuevo?${parametros}`));
  }

  /**
   * Mientras se escribe el nombre se mira si alguien lo ha dado de alta ya.
   * Tambien es el aviso de duplicado: el resultado dice si ya lo tengo.
   */
  useEffect(() => {
    if (perfumeId || fichaId || v.nombre.trim().length < 3) {
      setCatalogo([]);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      try {
        const r = await fetch(`/api/catalogo?q=${encodeURIComponent(v.nombre)}`, {
          signal: control.signal,
        });
        const datos = await r.json();
        setCatalogo(datos.resultados ?? []);
      } catch {
        // Sin conexion no hay catalogo, pero el alta a mano sigue.
      }
    }, 300);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [v.nombre, perfumeId, fichaId]);

  async function usarFicha(id: string) {
    setCargandoFicha(true);
    setError(null);
    try {
      const r = await fetch(`/api/catalogo?id=${id}`);
      const datos = await r.json();
      if (!r.ok || !datos.ficha) throw new Error();
      setV((previo) => conFicha(previo, datos.ficha));
      setFichaId(id);
      setCatalogo([]);
      setPaso(PRIMER_PASO_PERSONAL);
      setModo('revision');
    } catch {
      setError('No se ha podido cargar la ficha. Sigue a mano o inténtalo otra vez.');
    } finally {
      setCargandoFicha(false);
    }
  }

  /** Aplica la ficha como SUGERENCIA: no pisa nada de lo que ya haya escrito. */
  function aplicarFicha(nueva: FichaFragrantica) {
    setFicha(nueva);
    // Con la ficha leida, a la revision: alli estan los votos junto a cada
    // casilla, tambien al volver a consultar desde la edicion.
    setModo('revision');
    const notasNuevas = [
      ...nueva.notas.salida.map((nombre) => ({ nombre, nivel: 'SALIDA' as const })),
      ...nueva.notas.corazon.map((nombre) => ({ nombre, nivel: 'CORAZON' as const })),
      ...nueva.notas.fondo.map((nombre) => ({ nombre, nivel: 'FONDO' as const })),
    ];
    cambiar({
      marca: v.marca || nueva.marca || '',
      anioLanzamiento: v.anioLanzamiento || (nueva.anio ? String(nueva.anio) : ''),
      notas: v.notas.length > 0 ? v.notas : notasNuevas,
      // Las familias que coinciden con los acordes, en su orden de fuerza.
      familiaIds: v.familiaIds.length > 0 ? v.familiaIds : familiasDeAcordes(nueva.acordes, familias),
    });
  }

  async function consultarFragrantica(cuerpo: Record<string, string>) {
    setConsultando(true);
    setAvisoFragrantica(null);
    try {
      const r = await fetch('/api/fragrantica', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const datos = await r.json();
      if (datos.ok) aplicarFicha(datos.ficha);
      else setAvisoFragrantica(datos.mensaje ?? 'No se ha podido leer la ficha.');
    } catch {
      setAvisoFragrantica('No hay conexión. Sigue a mano: no pierdes nada de lo escrito.');
    } finally {
      setConsultando(false);
    }
  }

  /**
   * Pide a Claude su opinion sobre cada contexto, por las notas y las
   * opiniones que encuentre en internet. Si no hay nada marcado, marca los que
   * encajan; si ya hay algo, solo lo enseña, como los votos de Fragrantica.
   */
  async function pedirSugerencia() {
    sugerenciaPedida.current = true;
    setSugiriendo(true);
    setAvisoSugerencia(null);
    try {
      const familiasElegidas = familias.filter((f) => v.familiaIds.includes(f.id)).map((f) => f.nombre);
      const r = await fetch('/api/contextos-sugeridos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: v.nombre,
          marca: v.marca,
          concentracion: v.concentracion || undefined,
          notas: v.notas,
          familias: familiasElegidas,
        }),
      });
      const datos = await r.json();
      if (!datos.ok) {
        setAvisoSugerencia(datos.mensaje ?? 'No se han podido sugerir contextos. Márcalos a mano.');
        return;
      }
      const nueva: SugerenciaContextos = datos.sugerencia;
      setSugerencia(nueva);
      setV((previo) =>
        previo.contextoIds.length > 0 ? previo : { ...previo, contextoIds: contextosQueEncajan(nueva) },
      );
    } catch {
      setAvisoSugerencia('No hay conexión. Marca los contextos a mano.');
    } finally {
      setSugiriendo(false);
    }
  }

  /**
   * Se pide sola al llegar a los contextos, en un alta y al editar, con
   * nombre y marca ya puestos y, si los hay, las notas y familias. Al editar
   * ya hay contextos marcados, asi que solo se enseña la opinion.
   */
  // Al editar, la revision es la pantalla de entrada: pedirla ahi la lanzaria
  // cada vez que se abre el editor. Ahi queda el boton; sola, solo en el paso.
  const enContextos = (modo === 'revision' && !perfumeId) || (modo === 'pasos' && paso === 6);
  useEffect(() => {
    if (!sugerirConIa || sugerenciaPedida.current || !enContextos) return;
    if (!v.nombre.trim() || !v.marca.trim()) return;
    void pedirSugerencia();
    // Solo depende de haber llegado al paso: el resto se lee al pedirla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enContextos]);

  async function guardar(confirmarDuplicado = false) {
    setGuardando(true);
    setError(null);
    setDuplicadoDe(null);
    // Una nota escrita sin pulsar Intro tambien cuenta.
    const notas = conNotasPendientes();
    let respuesta: RespuestaPerfume;
    try {
      respuesta = await accionGuardarPerfume(perfumeId ?? null, {
        fichaId,
        nombre: v.nombre,
        marca: v.marca,
        concentracion: v.concentracion || null,
        anioLanzamiento: v.anioLanzamiento || null,
        volumenMl: v.volumenMl || null,
        fechaCompra: v.fechaCompra || null,
        estado: v.estado,
        valoracion: v.valoracion || null,
        notasPersonales: v.notasPersonales || null,
        fragranticaUrl: v.fragranticaUrl || null,
        // Solo si esta lectura los trae: si no, se quedan los que hubiera.
        parecidos: ficha && ficha.parecidos.length > 0 ? ficha.parecidos : undefined,
        notas: notas.map((n, orden) => ({ ...n, orden })),
        familiaIds: v.familiaIds,
        contextoIds: v.contextoIds,
        estaciones: v.estaciones,
        momentos: v.momentos,
        confirmarDuplicado,
        deseoId: deseoId ?? null,
      });
    } catch {
      // Sin cobertura la accion ni llega: el boton se quedaba en «Guardando…»
      // para siempre. Lo marcado sigue en pantalla para reintentar.
      setError(
        navigator.onLine
          ? 'No se ha podido guardar. Tus datos siguen aquí: inténtalo otra vez.'
          : 'Sin conexión: no se ha guardado. Tus datos siguen aquí; vuelve a pulsar cuando tengas cobertura.',
      );
      return;
    } finally {
      setGuardando(false);
    }

    if (respuesta.ok) {
      sinCambios.current = true;
      // Al editar se sustituye el editor en el historial: «atrás» desde la
      // ficha volvia al formulario ya guardado.
      const destino = `/coleccion/${respuesta.id}${
        perfumeId ? '?guardado=1' : respuesta.deseoConvertido ? '?guardado=deseo' : ''
      }`;
      if (perfumeId) router.replace(destino);
      else router.push(destino);
    } else if (respuesta.duplicado) {
      setDuplicadoDe(respuesta.duplicado);
    } else setError(respuesta.error);
  }

  /**
   * En un alta con una ficha del catalogo, lo comun es de todos: «Cambiar» el
   * nombre o la marca reescribia la ficha y renombraba el perfume de las demas
   * cuentas. Si no es este perfume, se suelta la ficha y se sigue a mano.
   */
  function noEsEste() {
    setFichaId(null);
    irAPaso(0);
  }

  const puedeAvanzar = [
    v.nombre.trim() !== '' && v.marca.trim() !== '',
    true,
    true,
    true,
    v.estaciones.length > 0,
    v.momentos.length > 0,
    v.contextoIds.length > 0,
    true,
  ][paso];

  const seccionNombre = () => (
      <section className="space-y-4">
        {/* Si ya llego con la URL, el enlace esta puesto en el paso de Fragrantica. */}
        {!perfumeId && !fichaId && !iniciales?.fragranticaUrl ? (
          <div className="tarjeta space-y-3">
            <div>
              <label htmlFor="enlace">Enlace de Fragrantica</label>
              <p className="mt-1 text-sm text-texto-tenue">
                Pégalo y se rellena todo: nombre, marca, año, notas, familias y los votos de
                estación y momento. Si no lo tienes, escribe el nombre y la marca debajo.
              </p>
            </div>
            <input
              id="enlace"
              type="url"
              inputMode="url"
              placeholder="https://www.fragrantica.es/perfume/…"
              value={enlace}
              onChange={(e) => {
                setEnlace(e.target.value);
                setErrorEnlace(null);
              }}
              // Pegar un enlace de ficha basta; si lo pegado no lo es, se
              // espera al boton para no regañar a medio escribir.
              onPaste={(e) => abrirEnlace(e.clipboardData.getData('text'), false)}
            />
            {errorEnlace ? (
              <p className="aviso-error" role="alert">
                {errorEnlace}
              </p>
            ) : null}
            <button
              type="button"
              disabled={abriendoEnlace || !enlace.trim()}
              onClick={() => abrirEnlace(enlace)}
              className="boton-primario w-full"
            >
              {abriendoEnlace ? 'Abriendo la ficha…' : 'Leer la ficha'}
            </button>
          </div>
        ) : null}
        <div>
          <label htmlFor="nombre">Nombre</label>
          <input
            id="nombre"
            value={v.nombre}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="marca">Marca</label>
          <input
            id="marca"
            value={v.marca}
            onChange={(e) => cambiar({ marca: e.target.value })}
            list="marcas-conocidas"
            className="mt-1"
          />
        </div>
        {catalogo.length > 0 ? (
          <div className="tarjeta space-y-3">
            <p className="font-medium">Ya está en Scentify</p>
            <ul className="space-y-2">
              {catalogo.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{c.nombre}</span>
                    <span className="block truncate text-sm text-texto-tenue">
                      {[c.marca, c.concentracion, c.anioLanzamiento].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {c.miPerfumeId ? (
                    <a href={`/coleccion/${c.miPerfumeId}`} className="shrink-0 text-sm underline">
                      Ya lo tienes
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={cargandoFicha}
                      onClick={() => usarFicha(c.id)}
                      className="boton-secundario shrink-0 px-3 text-sm"
                    >
                      Usar esta ficha
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-sm text-texto-tenue">
              Si no es ninguno, sigue: se creará una ficha nueva.
            </p>
          </div>
        ) : null}
      </section>
  );

  const seccionFragrantica = () => (
      <section className="space-y-4">
        <p className="text-sm text-texto-tenue">
          Opcional. Pega la URL de la ficha y se leen las notas y los votos como apoyo. Si falla,
          sigues a mano y no pierdes nada.
        </p>
        <div>
          <label htmlFor="fragrantica">URL de Fragrantica</label>
          <input
            id="fragrantica"
            type="url"
            inputMode="url"
            placeholder="https://www.fragrantica.com/perfume/…"
            value={v.fragranticaUrl}
            onChange={(e) => cambiar({ fragranticaUrl: e.target.value })}
            className="mt-1"
          />
        </div>
        <button
          type="button"
          disabled={consultando || !v.fragranticaUrl}
          onClick={() => consultarFragrantica({ url: v.fragranticaUrl })}
          className="boton-secundario w-full"
        >
          {consultando ? 'Consultando…' : 'Consultar ficha'}
        </button>
        {consultando ? (
          <p className="text-sm text-texto-tenue" role="status">
            Leyendo la ficha en Fragrantica. Puede tardar hasta medio minuto.
          </p>
        ) : null}

        {ficha ? (
          <p className="aviso-hecho">
            Ficha leída. Los votos aparecen en los pasos de estaciones y momento.
          </p>
        ) : null}

        {ficha && ficha.parecidos.length > 0 ? (
          <div className="space-y-2">
            <h2 className="subtitulo">Esta fragancia me recuerda a</h2>
            <ParecidosFragrantica perfumes={ficha.parecidos} />
            <p className="text-xs text-texto-tenue">Se guarda en la ficha al terminar.</p>
          </div>
        ) : null}

        {avisoFragrantica ? (
          <div className="space-y-3">
            <p className="aviso-atencion">
              {avisoFragrantica}
            </p>
            <p className="text-sm text-texto-tenue">
              Lo más cómodo es el{' '}
              <a href="/mas/importador" className="text-texto underline">
                botón «Enviar a Scentify»
              </a>
              : lo pulsas con la ficha abierta en Fragrantica y llega todo leído, sin copiar nada.
            </p>
            <div>
              <label htmlFor="pegado">O pega aquí el texto copiado del navegador</label>
              {/*
                Se pide la pagina entera a proposito. Acotar la seleccion a un
                tramo concreto obligaba a nombrar rotulos que no estan en todas
                las fichas —hay maquetaciones sin "Votar por ingredientes", y en
                otras la piramide va al final, detras de las fotos—, asi que la
                instruccion fallaba justo cuando mas falta hacia. El parser acota
                por su cuenta el bloque de votos, de modo que el ruido de
                resenias y noticias ya no le afecta.
              */}
              <p className="mt-1 text-sm text-texto-tenue">
                Abre la ficha en el navegador, selecciona{' '}
                <strong className="text-texto">toda la página</strong> con Ctrl+A (⌘+A en Mac),
                cópiala y pégala aquí. No hace falta que recortes nada: de todo eso se sacan
                los acordes, la pirámide de notas y los votos de estación y momento.
              </p>
              <p className="mt-2 text-sm text-texto-tenue">
                En el móvil sale más a cuenta no pasar por aquí: selecciona todo y dale a{' '}
                <strong className="text-texto">Compartir → Scentify</strong>. Llega ya leído y
                te ahorras copiar y cambiar de aplicación.
              </p>
              <textarea
                id="pegado"
                rows={5}
                value={textoPegado}
                onChange={(e) => setTextoPegado(e.target.value)}
                className="mt-2"
              />
            </div>
            <button
              type="button"
              disabled={consultando || !textoPegado.trim()}
              onClick={() => consultarFragrantica({ texto: textoPegado })}
              className="boton-secundario w-full"
            >
              Leer el texto pegado
            </button>
          </div>
        ) : null}
      </section>
  );

  const seccionNotas = () => (
      <section className="space-y-5">
        {NIVELES.map(({ clave, titulo }) => (
          <div key={clave} className="space-y-2">
            <p className="font-semibold">{titulo}</p>
            <div className="flex flex-wrap gap-2">
              {v.notas
                .map((n, i) => ({ ...n, i }))
                .filter((n) => n.nivel === clave)
                .map((n) => (
                  <button
                    key={`${n.nombre}-${n.i}`}
                    type="button"
                    onClick={() => cambiar({ notas: v.notas.filter((_, i) => i !== n.i) })}
                    data-activo="true"
                    className="chip"
                  >
                    {n.nombre} <span aria-hidden="true">×</span>
                    <span className="sr-only">quitar</span>
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                list="notas-conocidas"
                enterKeyHint="enter"
                aria-label={`Añadir nota de ${titulo.toLowerCase()}`}
                placeholder={`Añadir nota de ${titulo.toLowerCase()}…`}
                value={pendientes[clave]}
                onChange={(e) => setPendientes((p) => ({ ...p, [clave]: e.target.value }))}
                // Al salir del campo (p. ej. al pulsar «Siguiente») lo escrito
                // se añade: antes se perdia si no se pulsaba Intro.
                onBlur={() => añadirNotas(clave)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  añadirNotas(clave);
                }}
              />
              <button
                type="button"
                onClick={() => añadirNotas(clave)}
                disabled={!pendientes[clave].trim()}
                className="boton-secundario shrink-0 px-4"
                aria-label={`Añadir a ${titulo.toLowerCase()}`}
              >
                +
              </button>
            </div>
          </div>
        ))}
        <p className="text-xs text-texto-tenue">
          Varias a la vez separadas por comas. Las notas que no existan se crean solas.
        </p>
      </section>
  );

  const seccionFamilias = () => (
      <section className="space-y-3">
        <p className="text-sm text-texto-tenue">Familias olfativas y acordes principales.</p>
        <div className="flex flex-wrap gap-2">
          {familias.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={v.familiaIds.includes(f.id)}
              onClick={() => cambiar({ familiaIds: alternar(v.familiaIds, f.id) })}
              className="chip"
            >
              {f.nombre}
            </button>
          ))}
        </div>
        {ficha && ficha.acordes.length > 0 ? (
          <AcordesDeFragrantica acordes={ficha.acordes} familias={familias} />
        ) : null}
      </section>
  );

  const seccionEstaciones = () => (
      <section className="space-y-3">
        <p className="text-sm text-texto-tenue">
          Marca las estaciones. Los votos son solo una referencia: manda lo que marques tú.
        </p>
        <SinVotos ficha={ficha} eje="estaciones" />
        <MarcarSegunVotos
          propuesta={masVotadas(ficha?.estaciones)}
          actual={v.estaciones}
          aplicar={(estaciones) => cambiar({ estaciones })}
        />
        <ul className="space-y-2">
          {ESTACIONES.map(({ clave, nombre }) => (
            <li key={clave}>
              <button
                type="button"
                aria-pressed={v.estaciones.includes(clave)}
                onClick={() => cambiar({ estaciones: alternar(v.estaciones, clave) })}
                className="opcion fila-toque justify-between"
              >
                <span className="font-medium">{nombre}</span>
                <BarraVoto voto={ficha?.estaciones?.[clave]} />
              </button>
            </li>
          ))}
        </ul>
      </section>
  );

  const seccionMomento = () => (
      <section className="space-y-3">
        <p className="text-sm text-texto-tenue">Día, noche o ambos. Mínimo uno.</p>
        <SinVotos ficha={ficha} eje="momentos" />
        <MarcarSegunVotos
          propuesta={masVotadas(ficha?.momentos)}
          actual={v.momentos}
          aplicar={(momentos) => cambiar({ momentos })}
        />
        <ul className="space-y-2">
          {(['DIA', 'NOCHE'] as const).map((m) => (
            <li key={m}>
              <button
                type="button"
                aria-pressed={v.momentos.includes(m)}
                onClick={() => cambiar({ momentos: alternar(v.momentos, m) })}
                className="opcion fila-toque justify-between"
              >
                <span className="font-medium">{m === 'DIA' ? 'Día' : 'Noche'}</span>
                <BarraVoto voto={ficha?.momentos?.[m]} />
              </button>
            </li>
          ))}
        </ul>
      </section>
  );

  const seccionContextos = () => (
      <section className="space-y-3">
        <p className="text-sm text-texto-tenue">Mínimo uno, los que quieras.</p>
        {sugerirConIa ? (
          <SugerenciaDeContextos
            sugerencia={sugerencia}
            sugiriendo={sugiriendo}
            aviso={avisoSugerencia}
            actual={v.contextoIds}
            pedir={pedirSugerencia}
            aplicar={(contextoIds) => cambiar({ contextoIds })}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {contextos.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={v.contextoIds.includes(c.id)}
              onClick={() => cambiar({ contextoIds: alternar(v.contextoIds, c.id) })}
              className="chip"
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </section>
  );

  const seccionInventario = () => (
      <section className="space-y-4">
        <div>
          <span className="block text-sm font-medium text-texto-tenue">Estado</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(['LO_TENGO', 'LO_TUVE'] as const).map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={v.estado === e}
                onClick={() => cambiar({ estado: e })}
                className="opcion"
              >
                {e === 'LO_TENGO' ? 'Lo tengo' : 'Lo tuve'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="concentracion">Concentración</label>
          <select
            id="concentracion"
            value={v.concentracion}
            onChange={(e) => cambiar({ concentracion: e.target.value })}
            className="mt-1"
          >
            <option value="">Sin indicar</option>
            {['EDC', 'EDT', 'EDP', 'EXTRAIT', 'PARFUM', 'ACEITE', 'OTRO'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="volumen">Volumen (ml)</label>
            <input
              id="volumen"
              type="number"
              inputMode="numeric"
              min={1}
              value={v.volumenMl}
              onChange={(e) => cambiar({ volumenMl: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="anio">Año</label>
            <input
              id="anio"
              type="number"
              inputMode="numeric"
              value={v.anioLanzamiento}
              onChange={(e) => cambiar({ anioLanzamiento: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <label htmlFor="compra">Fecha de compra</label>
          <input
            id="compra"
            type="date"
            value={v.fechaCompra}
            onChange={(e) => cambiar({ fechaCompra: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <span className="block text-sm font-medium text-texto-tenue">Valoración</span>
          <div className="mt-1 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} de 5`}
                data-activo={Number(v.valoracion) >= n}
                onClick={() => cambiar({ valoracion: v.valoracion === String(n) ? '' : String(n) })}
                className="opcion flex-1 px-0"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="personales">Notas personales</label>
          <textarea
            id="personales"
            rows={3}
            value={v.notasPersonales}
            onChange={(e) => cambiar({ notasPersonales: e.target.value })}
            className="mt-1"
          />
        </div>
      </section>
  );

  /** Lo que la revision necesita antes de dejar guardar. */
  const faltan = [
    v.nombre.trim() === '' || v.marca.trim() === '' ? 'nombre y marca' : null,
    v.estaciones.length === 0 ? 'una estación' : null,
    v.momentos.length === 0 ? 'un momento' : null,
    v.contextoIds.length === 0 ? 'un contexto' : null,
  ].filter((f): f is string => f !== null);

  const puedeRevisar = Boolean(perfumeId) || Boolean(ficha) || Boolean(fichaId);

  /** Salta a un paso para corregirlo; desde alli se vuelve a la revision. */
  const irAPaso = (n: number) => {
    setPaso(n);
    setModo('pasos');
  };

  const revision = () => {
    const notasDe = (nivel: Nivel) =>
      v.notas.filter((n) => n.nivel === nivel).map((n) => n.nombre);
    const familiasElegidas = familias.filter((f) => v.familiaIds.includes(f.id)).map((f) => f.nombre);
    const yaLoTengo = !perfumeId ? catalogo.find((c) => c.miPerfumeId) : undefined;
    return (
      <div className="space-y-6">
        {yaLoTengo?.miPerfumeId ? (
          <div className="aviso-atencion space-y-2">
            <p>
              Ya tienes {yaLoTengo.nombre} ({[yaLoTengo.marca, yaLoTengo.concentracion].filter(Boolean).join(' · ')}).
            </p>
            <a href={`/coleccion/${yaLoTengo.miPerfumeId}`} className="underline">
              Ver el tuyo
            </a>
          </div>
        ) : null}
        <section className="tarjeta space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-xl">{v.nombre || 'Sin nombre'}</p>
              <p className="text-sm text-texto-tenue">
                {[v.marca, v.concentracion, v.anioLanzamiento].filter(Boolean).join(' · ') || 'Sin marca'}
              </p>
            </div>
            {fichaId && !perfumeId ? (
              <button type="button" onClick={noEsEste} className="shrink-0 text-sm underline">
                No es este
              </button>
            ) : (
              <button type="button" onClick={() => irAPaso(0)} className="shrink-0 text-sm underline">
                Cambiar
              </button>
            )}
          </div>
          <div className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0 space-y-1">
              {NIVELES.map(({ clave, titulo }) => (
                <p key={clave}>
                  <span className="text-texto-tenue">{titulo}: </span>
                  {notasDe(clave).join(', ') || '—'}
                </p>
              ))}
            </div>
            <button type="button" onClick={() => irAPaso(2)} className="shrink-0 underline">
              Editar
            </button>
          </div>
          <div className="flex items-start justify-between gap-3 text-sm">
            <p className="min-w-0">
              <span className="text-texto-tenue">Familias: </span>
              {familiasElegidas.join(', ') || '—'}
            </p>
            <button type="button" onClick={() => irAPaso(3)} className="shrink-0 underline">
              Editar
            </button>
          </div>
          {/* Recien leido: se guarda en la ficha con sus votos. */}
          {ficha && ficha.parecidos.length > 0 ? (
            <p className="text-sm">
              <span className="text-texto-tenue">Me recuerda a: </span>
              {ficha.parecidos.map((p) => p.nombre).join(', ')}
            </p>
          ) : null}
          {perfumeId ? (
            <button type="button" onClick={() => irAPaso(1)} className="text-sm underline">
              {v.fragranticaUrl ? 'Volver a consultar Fragrantica' : 'Consultar Fragrantica'}
            </button>
          ) : null}
        </section>

        <div className="space-y-2">
          <h2 className="subtitulo">Estaciones</h2>
          {seccionEstaciones()}
        </div>
        <div className="space-y-2">
          <h2 className="subtitulo">Momento</h2>
          {seccionMomento()}
        </div>
        <div className="space-y-2">
          <h2 className="subtitulo">Contextos</h2>
          {seccionContextos()}
        </div>
        <details className="tarjeta">
          <summary className="cursor-pointer font-medium">
            Inventario y valoración <span className="text-texto-tenue">(opcional)</span>
          </summary>
          <div className="pt-4">{seccionInventario()}</div>
        </details>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {modo === 'pasos' ? (
        <div className="space-y-2">
          <p className="text-sm text-texto-tenue">
            Paso {paso + 1} de {PASOS.length} · {PASOS[paso]}
          </p>
          <div className="h-1.5 overflow-hidden bg-borde">
            <div
              className="h-full bg-acento transition-all"
              style={{ width: `${((paso + 1) / PASOS.length) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      {perfumeId && compartidaCon > 0 ? (
        <p className="aviso-atencion">
          {compartidaCon === 1 ? 'Otra persona tiene' : `Otras ${compartidaCon} personas tienen`} este
          perfume. Lo que cambies en nombre, marca, notas, familias, concentración o año lo verán
          también; tus estaciones, momentos, contextos e inventario son solo tuyos.
        </p>
      ) : null}

      {!perfumeId && fichaId ? (
        <div className="aviso-hecho flex items-start justify-between gap-3">
          <p>
            Usando la ficha de Scentify de <strong className="text-texto">{v.nombre}</strong>. Solo
            te queda lo tuyo: estaciones, momentos, contextos e inventario.
          </p>
          <button
            type="button"
            onClick={() => setFichaId(null)}
            className="shrink-0 text-sm underline"
          >
            Quitar
          </button>
        </div>
      ) : null}

      {modo === 'pasos' && paso === 0 ? seccionNombre() : null}

      {modo === 'pasos' && paso === 1 ? seccionFragrantica() : null}

      {modo === 'pasos' && paso === 2 ? seccionNotas() : null}

      {modo === 'pasos' && paso === 3 ? seccionFamilias() : null}

      {modo === 'pasos' && paso === 4 ? seccionEstaciones() : null}

      {modo === 'pasos' && paso === 5 ? seccionMomento() : null}

      {modo === 'pasos' && paso === 6 ? seccionContextos() : null}

      {modo === 'pasos' && paso === 7 ? seccionInventario() : null}

      {modo === 'revision' ? revision() : null}

      {error ? (
        <p className="aviso-error" role="alert">
          {error}
        </p>
      ) : null}

      {duplicadoDe ? (
        <div className="aviso-atencion space-y-2" role="alert">
          <p>Ya tienes este perfume en tu colección.</p>
          <div className="flex flex-wrap gap-2">
            <a href={`/coleccion/${duplicadoDe}`} className="boton-secundario px-4 text-sm">
              Ver el que tengo
            </a>
            <button
              type="button"
              disabled={guardando}
              onClick={() => void guardar(true)}
              className="boton-fantasma px-3 text-sm"
            >
              Es otro frasco, añadirlo
            </button>
          </div>
        </div>
      ) : null}

      {modo === 'revision' ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={guardando || faltan.length > 0}
            onClick={() => void guardar()}
            className="boton-primario w-full"
          >
            {guardando ? 'Guardando…' : perfumeId ? 'Guardar cambios' : 'Añadir a la colección'}
          </button>
          {faltan.length > 0 ? (
            <p className="text-center text-sm text-texto-tenue">Falta marcar {faltan.join(', ')}.</p>
          ) : null}
        </div>
      ) : null}

      {modo === 'pasos' && puedeRevisar ? (
        <button
          type="button"
          onClick={() => setModo('revision')}
          className="w-full text-center text-sm underline"
        >
          Revisar todo en una pantalla
        </button>
      ) : null}

      <div className={modo === 'pasos' ? 'flex gap-2' : 'hidden'}>
        {paso > 0 ? (
          <button type="button" onClick={() => setPaso(paso - 1)} className="boton-secundario flex-1">
            Atrás
          </button>
        ) : null}
        {paso < PASOS.length - 1 ? (
          <button
            type="button"
            disabled={!puedeAvanzar}
            onClick={() => setPaso(paso + 1)}
            className="boton-primario flex-1"
          >
            Siguiente
          </button>
        ) : (
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardar()}
            className="boton-primario flex-1"
          >
            {guardando ? 'Guardando…' : perfumeId ? 'Guardar cambios' : 'Añadir a la colección'}
          </button>
        )}
      </div>

      <datalist id="notas-conocidas">
        {notasConocidas.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}

/**
 * Vuelca una ficha del catalogo en el formulario. Lo de la ficha se sustituye
 * entero; de las estaciones y los momentos, que son personales, solo se
 * proponen los de quien la dio de alta si todavia no hay nada marcado.
 */
function conFicha(previo: ValoresPerfume, ficha: FichaParaAlta): ValoresPerfume {
  return {
    ...previo,
    nombre: ficha.nombre,
    marca: ficha.marca,
    concentracion: ficha.concentracion ?? '',
    anioLanzamiento: ficha.anioLanzamiento?.toString() ?? '',
    fragranticaUrl: ficha.fragranticaUrl ?? previo.fragranticaUrl,
    notas: ficha.notas,
    familiaIds: ficha.familiaIds,
    estaciones: previo.estaciones.length > 0 ? previo.estaciones : ficha.estaciones,
    momentos: previo.momentos.length > 0 ? previo.momentos : ficha.momentos,
  };
}

/**
 * La opinion de Claude encima de las casillas de contextos: los que encajan y
 * los que no, cada uno con su motivo, y el boton para marcar justo los que
 * encajan si se ha cambiado algo.
 */
function SugerenciaDeContextos({
  sugerencia,
  sugiriendo,
  aviso,
  actual,
  pedir,
  aplicar,
}: {
  sugerencia: SugerenciaContextos | null;
  sugiriendo: boolean;
  aviso: string | null;
  actual: string[];
  pedir: () => void;
  aplicar: (contextoIds: string[]) => void;
}) {
  if (sugiriendo) {
    return (
      <p className="text-sm text-texto-tenue" aria-live="polite">
        Buscando opiniones y mirando las notas para valorar cada contexto…
      </p>
    );
  }
  if (!sugerencia) {
    return (
      <div className="space-y-2">
        {aviso ? <p className="aviso-atencion">{aviso}</p> : null}
        <button type="button" onClick={pedir} className="boton-secundario w-full text-sm">
          Sugerir contextos con IA
        </button>
      </div>
    );
  }
  const encajan = sugerencia.valoraciones.filter((c) => c.encaja);
  const noEncajan = sugerencia.valoraciones.filter((c) => !c.encaja);
  const grupo = (titulo: string, simbolo: string, lista: typeof encajan) =>
    lista.length > 0 ? (
      <div className="space-y-1">
        <p className="font-semibold">{titulo}</p>
        <ul className="space-y-1">
          {lista.map((c) => (
            <li key={c.id}>
              <span aria-hidden="true">{simbolo} </span>
              <span className="font-medium">{c.nombre}</span>
              <span className="text-texto-tenue"> — {c.motivo}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <div className="tarjeta space-y-3 text-sm">
      {sugerencia.resumen ? <p>{sugerencia.resumen}</p> : null}
      {encajan.length === 0 ? (
        <p className="text-texto-tenue">No encaja claro en ninguno de tus contextos.</p>
      ) : null}
      {grupo('Lo recomienda para', '✓', encajan)}
      {grupo('No lo recomienda para', '✗', noEncajan)}
      <MarcarSegunVotos
        propuesta={encajan.map((c) => c.id)}
        actual={actual}
        aplicar={aplicar}
        etiqueta="Marcar los recomendados"
      />
      <p className="text-xs text-texto-tenue">Opinión de la IA: manda lo que marques tú.</p>
    </div>
  );
}
