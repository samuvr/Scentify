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
 * aqui: lo que se envia al servidor son unicamente mis selecciones (5.3).
 *
 * La ficha (nombre, marca, notas, familias, concentracion, anio) es comun a
 * todas las cuentas. Al escribir el nombre se busca en ese catalogo, y elegir
 * una ficha rellena todo eso de golpe: solo queda lo personal.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { accionGuardarPerfume, type RespuestaPerfume } from '@/app/acciones';
import type { Estacion, Momento } from '@/dominio/tipos';
import { familiasDeAcordes } from '@/dominio/familias';
import type { FichaFragrantica, VotoEje } from '@/dominio/fragrantica';
import type { FichaParaAlta } from '@/servicios/consultas';
import { VALORES_VACIOS, type Nivel, type ValoresPerfume } from '@/componentes/valores-perfume';

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

/** Barra de apoyo con el voto de Fragrantica. Solo visual: no decide nada. */
function BarraVoto({ voto }: { voto: VotoEje | undefined }) {
  if (!voto) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-texto-tenue">
      <span className="inline-block h-1.5 w-12 overflow-hidden bg-borde">
        <span className="block h-full bg-acento/70" style={{ width: `${voto.pct}%` }} />
      </span>
      {voto.pct}%{voto.votos !== null ? ` · ${voto.votos}` : ''}
    </span>
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
}: {
  perfumeId?: string;
  iniciales?: ValoresPerfume;
  /**
   * Ficha del catalogo que ya encaja con lo que llega, p. ej. la misma URL de
   * Fragrantica compartida desde el movil. Se usa directamente.
   */
  fichaCatalogo?: FichaParaAlta | null;
  /** Al editar: cuantas personas mas tienen este perfume y veran la ficha. */
  compartidaCon?: number;
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
    fichaCatalogo ? PRIMER_PASO_PERSONAL : compartida ? 1 : 0,
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
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiar = (parcial: Partial<ValoresPerfume>) => setV((previo) => ({ ...previo, ...parcial }));

  /**
   * Y se intenta leer la ficha sola, que es lo que se espera al compartir. El
   * ref evita repetirlo: sin el, cada render volveria a lanzar la peticion.
   * Si falla, el aviso y el cuadro de pegar el texto aparecen igual que
   * cuando se pulsa el boton a mano.
   */
  const yaConsultada = useRef(false);
  useEffect(() => {
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
    } catch {
      setError('No se ha podido cargar la ficha. Sigue a mano o inténtalo otra vez.');
    } finally {
      setCargandoFicha(false);
    }
  }

  /** Aplica la ficha como SUGERENCIA: no pisa nada de lo que ya haya escrito. */
  function aplicarFicha(nueva: FichaFragrantica) {
    setFicha(nueva);
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

  async function guardar() {
    setGuardando(true);
    setError(null);
    const respuesta: RespuestaPerfume = await accionGuardarPerfume(perfumeId ?? null, {
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
      notas: v.notas.map((n, orden) => ({ ...n, orden })),
      familiaIds: v.familiaIds,
      contextoIds: v.contextoIds,
      estaciones: v.estaciones,
      momentos: v.momentos,
    });
    setGuardando(false);

    if (respuesta.ok) router.push(`/coleccion/${respuesta.id}`);
    else setError(respuesta.error);
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

  return (
    <div className="space-y-5">
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

      {paso === 0 ? (
        <section className="space-y-4">
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
      ) : null}

      {paso === 1 ? (
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

          {ficha ? (
            <p className="aviso-hecho">
              Ficha leída. Los votos aparecen en los pasos de estaciones y momento.
            </p>
          ) : null}

          {avisoFragrantica ? (
            <div className="space-y-3">
              <p className="aviso-atencion">
                {avisoFragrantica}
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
      ) : null}

      {paso === 2 ? (
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
                      className="etiqueta border-acento/50 text-acento"
                    >
                      {n.nombre} <span aria-hidden="true">×</span>
                      <span className="sr-only">quitar</span>
                    </button>
                  ))}
              </div>
              <input
                type="text"
                list="notas-conocidas"
                placeholder={`Añadir nota de ${titulo.toLowerCase()}…`}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const nombre = e.currentTarget.value.trim();
                  if (!nombre) return;
                  cambiar({ notas: [...v.notas, { nombre, nivel: clave }] });
                  e.currentTarget.value = '';
                }}
              />
            </div>
          ))}
          <p className="text-xs text-texto-tenue">
            Intro para añadir. Las notas que no existan se crean solas.
          </p>
        </section>
      ) : null}

      {paso === 3 ? (
        <section className="space-y-3">
          <p className="text-sm text-texto-tenue">Familias olfativas y acordes principales.</p>
          <div className="flex flex-wrap gap-2">
            {familias.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={v.familiaIds.includes(f.id)}
                onClick={() => cambiar({ familiaIds: alternar(v.familiaIds, f.id) })}
                className={`etiqueta ${
                  v.familiaIds.includes(f.id) ? 'border-acento bg-acento/15 text-acento' : ''
                }`}
              >
                {f.nombre}
              </button>
            ))}
          </div>
          {ficha && ficha.acordes.length > 0 ? (
            <AcordesDeFragrantica acordes={ficha.acordes} familias={familias} />
          ) : null}
        </section>
      ) : null}

      {paso === 4 ? (
        <section className="space-y-3">
          <p className="text-sm text-texto-tenue">
            Marca las estaciones. Los votos son solo una referencia: manda lo que marques tú.
          </p>
          <ul className="space-y-2">
            {ESTACIONES.map(({ clave, nombre }) => (
              <li key={clave}>
                <button
                  type="button"
                  aria-pressed={v.estaciones.includes(clave)}
                  onClick={() => cambiar({ estaciones: alternar(v.estaciones, clave) })}
                  className={`fila-toque justify-between border ${
                    v.estaciones.includes(clave) ? 'border-acento bg-acento/10' : 'border-borde'
                  }`}
                >
                  <span className="font-medium">{nombre}</span>
                  <BarraVoto voto={ficha?.estaciones?.[clave]} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {paso === 5 ? (
        <section className="space-y-3">
          <p className="text-sm text-texto-tenue">Día, noche o ambos. Mínimo uno.</p>
          <ul className="space-y-2">
            {(['DIA', 'NOCHE'] as const).map((m) => (
              <li key={m}>
                <button
                  type="button"
                  aria-pressed={v.momentos.includes(m)}
                  onClick={() => cambiar({ momentos: alternar(v.momentos, m) })}
                  className={`fila-toque justify-between border ${
                    v.momentos.includes(m) ? 'border-acento bg-acento/10' : 'border-borde'
                  }`}
                >
                  <span className="font-medium">{m === 'DIA' ? 'Día' : 'Noche'}</span>
                  <BarraVoto voto={ficha?.momentos?.[m]} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {paso === 6 ? (
        <section className="space-y-3">
          <p className="text-sm text-texto-tenue">Mínimo uno, los que quieras.</p>
          <div className="flex flex-wrap gap-2">
            {contextos.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={v.contextoIds.includes(c.id)}
                onClick={() => cambiar({ contextoIds: alternar(v.contextoIds, c.id) })}
                className={`etiqueta ${
                  v.contextoIds.includes(c.id) ? 'border-acento bg-acento/15 text-acento' : ''
                }`}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {paso === 7 ? (
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
                  className={`boton ${v.estado === e ? 'bg-acento text-fondo' : 'border border-borde'}`}
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
                  onClick={() => cambiar({ valoracion: v.valoracion === String(n) ? '' : String(n) })}
                  className={`boton flex-1 px-0 ${
                    Number(v.valoracion) >= n ? 'bg-acento text-fondo' : 'border border-borde'
                  }`}
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
      ) : null}

      {error ? <p className="aviso-error">{error}</p> : null}

      <div className="flex gap-2">
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
            onClick={guardar}
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
