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
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { accionGuardarPerfume, type RespuestaPerfume } from '@/app/acciones';
import type { Estacion, Momento } from '@/dominio/tipos';
import type { FichaFragrantica, VotoEje } from '@/dominio/fragrantica';
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
}: {
  perfumeId?: string;
  iniciales?: ValoresPerfume;
  contextos: { id: string; nombre: string }[];
  familias: { id: string; nombre: string }[];
  notasConocidas: string[];
}) {
  const router = useRouter();
  /**
   * Llegando por «Compartir → Scentify» la URL ya viene puesta, y con ella el
   * nombre y la marca sacados de la propia direccion. Empezar en el paso 1
   * seria pedir lo que ya se tiene, asi que se salta al de Fragrantica.
   */
  const compartida = !perfumeId && Boolean(iniciales?.fragranticaUrl);
  const [paso, setPaso] = useState(compartida ? 1 : 0);
  const [v, setV] = useState<ValoresPerfume>(iniciales ?? VALORES_VACIOS);
  const [duplicados, setDuplicados] = useState<{ id: string; nombre: string; marca: string }[]>([]);
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
    void consultarFragrantica({ url: iniciales?.fragranticaUrl ?? '' });
    // Solo al montar: `compartida` se calcula de los valores iniciales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function comprobarDuplicados() {
    if (perfumeId || v.nombre.trim().length < 3) return;
    try {
      const r = await fetch(`/api/buscar?q=${encodeURIComponent(v.nombre)}`);
      const datos = await r.json();
      setDuplicados(datos.resultados ?? []);
    } catch {
      // Sin conexion no hay aviso de duplicado, pero el alta sigue.
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

      {paso === 0 ? (
        <section className="space-y-4">
          <div>
            <label htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              value={v.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
              onBlur={comprobarDuplicados}
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
          {duplicados.length > 0 ? (
            <div className="aviso-atencion">
              <p className="font-medium">Puede que ya lo tengas:</p>
              <ul className="mt-1 space-y-0.5 text-texto-tenue">
                {duplicados.map((d) => (
                  <li key={d.id}>
                    {d.nombre} · {d.marca}
                  </li>
                ))}
              </ul>
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
            <p className="text-xs text-texto-tenue">
              Acordes en Fragrantica: {ficha.acordes.join(', ')}
            </p>
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
