'use client';

/**
 * Filtros combinables. Van en la URL para que una busqueda se pueda compartir,
 * recargar y volver atras sin perderla.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MINIMO_CARACTERES_BUSQUEDA } from '@/dominio/texto';
import { CLAVE_ULTIMA_COLECCION } from '@/componentes/VolverAColeccion';
import { admiteMomento, momentosDe } from '@/dominio/contextos';
import type { Momento } from '@/dominio/tipos';
import { sentidoPorDefecto, type OrdenColeccion } from '@/dominio/orden-coleccion';

/** Lo justo para no lanzar una consulta por cada tecla al escribir seguido. */
const ESPERA_MS = 250;

export function Filtros({
  marcas,
  familias,
  contextos,
  notas,
}: {
  marcas: string[];
  familias: { id: string; nombre: string }[];
  /** Con sus momentos: la oficina de noche no se ofrece. */
  contextos: { id: string; nombre: string; atemporal: boolean; momentos: Momento[] }[];
  /** Solo las notas que hay en la coleccion: las demas darian siempre 0. */
  notas: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(parametros.get('q') ?? '');

  // La ultima consulta, para que «‹ Colección» desde una ficha vuelva a ella.
  const consultaActual = parametros.toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_ULTIMA_COLECCION, consultaActual);
    } catch {
      // Sin sessionStorage, la ficha vuelve a la lista sin filtros.
    }
  }, [consultaActual]);

  function poner(clave: string, valor: string, reemplazar = false) {
    const nuevos = new URLSearchParams(parametros.toString());
    if (valor) nuevos.set(clave, valor);
    else nuevos.delete(clave);
    // Contexto y momento solo se combinan si el contexto existe en ese
    // momento: elegir Oficina quita «Noche», y al reves.
    const contexto = contextos.find((c) => c.id === nuevos.get('contexto'));
    const momento = nuevos.get('momento');
    if (contexto && (momento === 'DIA' || momento === 'NOCHE') && !admiteMomento(contexto, momento)) {
      nuevos.delete(clave === 'contexto' ? 'momento' : 'contexto');
    }
    const destino = `/coleccion?${nuevos}`;
    // Al escribir se reemplaza la entrada del historial: volver atras no debe
    // deshacer la busqueda letra a letra.
    if (reemplazar) router.replace(destino, { scroll: false });
    else router.push(destino);
  }

  // Busqueda al vuelo: filtra a partir de la tercera letra y se refina con cada
  // una que se escribe o se borra. Por debajo de tres, sin filtro de texto.
  const ultimaBuscada = useRef(parametros.get('q') ?? '');

  // Si la URL cambia por otro camino (un enlace a una nota, «atrás»), el campo
  // de texto la sigue: antes mostraba un texto que ya no filtraba.
  const qDeLaUrl = parametros.get('q') ?? '';
  useEffect(() => {
    if (qDeLaUrl === ultimaBuscada.current) return;
    ultimaBuscada.current = qDeLaUrl;
    setTexto(qDeLaUrl);
  }, [qDeLaUrl]);

  useEffect(() => {
    const limpio = texto.trim();
    const consulta = limpio.length >= MINIMO_CARACTERES_BUSQUEDA ? limpio : '';
    if (consulta === ultimaBuscada.current) return;
    const espera = setTimeout(() => {
      ultimaBuscada.current = consulta;
      poner('q', consulta, true);
    }, ESPERA_MS);
    return () => clearTimeout(espera);
    // `poner` cambia en cada render; lo que dispara la busqueda es el texto.
  }, [texto]);

  const ordenElegido: OrdenColeccion =
    (['nombre', 'marca', 'ultimo-uso', 'mas-usado'] as const).find(
      (o) => o === parametros.get('orden'),
    ) ?? 'nombre';
  const sentidoNatural = sentidoPorDefecto(ordenElegido);
  const sentido =
    (['asc', 'desc'] as const).find((d) => d === parametros.get('dir')) ?? sentidoNatural;
  const textoSentido = {
    nombre: { asc: 'De la A a la Z', desc: 'De la Z a la A' },
    marca: { asc: 'De la A a la Z', desc: 'De la Z a la A' },
    'ultimo-uso': { asc: 'Lo más antiguo primero', desc: 'Lo más reciente primero' },
    'mas-usado': { asc: 'Menos usados primero', desc: 'Más usados primero' },
  }[ordenElegido][sentido];

  const contextoElegido = contextos.find((c) => c.id === parametros.get('contexto'));
  const momentoElegido = (['DIA', 'NOCHE'] as const).find((m) => m === parametros.get('momento'));

  const activos = [...parametros.keys()].filter((k) => !['q', 'orden', 'dir'].includes(k)).length;

  const selector = (clave: string, etiqueta: string, opciones: { valor: string; texto: string }[]) => (
    <div>
      <label htmlFor={`f-${clave}`}>{etiqueta}</label>
      <select
        id={`f-${clave}`}
        value={parametros.get(clave) ?? ''}
        onChange={(e) => poner(clave, e.target.value)}
        className="mt-1"
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Intro busca ya, aunque sean menos de tres letras.
          ultimaBuscada.current = texto.trim();
          poner('q', texto.trim(), true);
        }}
      >
        <input
          type="search"
          placeholder="Buscar por nombre o marca…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Buscar en la colección"
        />
      </form>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="boton-secundario flex-1 text-sm"
        >
          Filtros{activos > 0 ? ` (${activos})` : ''}
        </button>
        <select
          value={ordenElegido}
          onChange={(e) => {
            // Cada orden arranca en su sentido natural: al pasar a «Más usado»
            // se quieren ver primero los mas usados.
            const nuevos = new URLSearchParams(parametros.toString());
            nuevos.set('orden', e.target.value);
            nuevos.delete('dir');
            router.push(`/coleccion?${nuevos}`);
          }}
          aria-label="Ordenar por"
          className="min-w-0 flex-1"
        >
          <option value="nombre">Nombre</option>
          <option value="marca">Marca</option>
          <option value="ultimo-uso">Último uso</option>
          <option value="mas-usado">Más usado</option>
        </select>
        <button
          type="button"
          onClick={() => {
            const contrario = sentido === 'asc' ? 'desc' : 'asc';
            // El sentido natural no se escribe en la URL: asi queda limpia.
            poner('dir', contrario === sentidoNatural ? '' : contrario);
          }}
          aria-label={`${textoSentido}. Invertir el orden`}
          title={textoSentido}
          className="boton-secundario shrink-0 px-3 text-lg"
        >
          <span aria-hidden="true">{sentido === 'asc' ? '↑' : '↓'}</span>
        </button>
      </div>

      {abierto ? (
        <div className="tarjeta space-y-3">
          {selector('estado', 'Estado', [
            { valor: 'LO_TENGO', texto: 'Lo tengo' },
            { valor: 'LO_TUVE', texto: 'Lo tuve' },
            { valor: 'MUESTRA', texto: 'Muestras probadas' },
          ])}
          {selector(
            'marca',
            'Marca',
            marcas.map((m) => ({ valor: m, texto: m })),
          )}
          {selector(
            'familia',
            'Familia',
            familias.map((f) => ({ valor: f.id, texto: f.nombre })),
          )}
          {selector(
            'nota',
            'Nota',
            notas.map((n) => ({ valor: n.id, texto: n.nombre })),
          )}
          {selector(
            'contexto',
            'Contexto',
            contextos
              .filter((c) => !momentoElegido || admiteMomento(c, momentoElegido))
              .map((c) => ({ valor: c.id, texto: c.nombre })),
          )}
          {selector('estacion', 'Estación', [
            { valor: 'PRIMAVERA', texto: 'Primavera' },
            { valor: 'VERANO', texto: 'Verano' },
            { valor: 'OTONO', texto: 'Otoño' },
            { valor: 'INVIERNO', texto: 'Invierno' },
          ])}
          {selector(
            'momento',
            'Momento',
            (contextoElegido ? momentosDe(contextoElegido) : (['DIA', 'NOCHE'] as const)).map(
              (m) => ({ valor: m, texto: m === 'DIA' ? 'Día' : 'Noche' }),
            ),
          )}
          {selector(
            'valoracion',
            'Valoración mínima',
            [1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: `${n} o más` })),
          )}
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={parametros.get('archivados') === '1'}
              onChange={(e) => poner('archivados', e.target.checked ? '1' : '')}
              className="h-5 w-5"
            />
            Incluir archivados
          </label>
          <button
            type="button"
            onClick={() => {
              ultimaBuscada.current = '';
              setTexto('');
              router.push('/coleccion');
            }}
            className="boton-fantasma w-full text-sm"
          >
            Limpiar filtros
          </button>
        </div>
      ) : null}
    </div>
  );
}
