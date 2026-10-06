'use client';

/**
 * Filtros combinables. Van en la URL para que una busqueda se pueda compartir,
 * recargar y volver atras sin perderla.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MINIMO_CARACTERES_BUSQUEDA } from '@/dominio/texto';

/** Lo justo para no lanzar una consulta por cada tecla al escribir seguido. */
const ESPERA_MS = 250;

export function Filtros({
  marcas,
  familias,
  contextos,
}: {
  marcas: string[];
  familias: { id: string; nombre: string }[];
  contextos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(parametros.get('q') ?? '');

  function poner(clave: string, valor: string, reemplazar = false) {
    const nuevos = new URLSearchParams(parametros.toString());
    if (valor) nuevos.set(clave, valor);
    else nuevos.delete(clave);
    const destino = `/coleccion?${nuevos}`;
    // Al escribir se reemplaza la entrada del historial: volver atras no debe
    // deshacer la busqueda letra a letra.
    if (reemplazar) router.replace(destino, { scroll: false });
    else router.push(destino);
  }

  // Busqueda al vuelo: filtra a partir de la tercera letra y se refina con cada
  // una que se escribe o se borra. Por debajo de tres, sin filtro de texto.
  const ultimaBuscada = useRef(parametros.get('q') ?? '');
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

  const activos = [...parametros.keys()].filter((k) => k !== 'q' && k !== 'orden').length;

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
          value={parametros.get('orden') ?? 'nombre'}
          onChange={(e) => poner('orden', e.target.value)}
          aria-label="Ordenar por"
          className="flex-1"
        >
          <option value="nombre">Nombre</option>
          <option value="marca">Marca</option>
          <option value="ultimo-uso">Último uso</option>
          <option value="mas-usado">Más usado</option>
        </select>
      </div>

      {abierto ? (
        <div className="tarjeta space-y-3">
          {selector('estado', 'Estado', [
            { valor: 'LO_TENGO', texto: 'Lo tengo' },
            { valor: 'LO_TUVE', texto: 'Lo tuve' },
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
            'contexto',
            'Contexto',
            contextos.map((c) => ({ valor: c.id, texto: c.nombre })),
          )}
          {selector('estacion', 'Estación', [
            { valor: 'PRIMAVERA', texto: 'Primavera' },
            { valor: 'VERANO', texto: 'Verano' },
            { valor: 'OTONO', texto: 'Otoño' },
            { valor: 'INVIERNO', texto: 'Invierno' },
          ])}
          {selector('momento', 'Momento', [
            { valor: 'DIA', texto: 'Día' },
            { valor: 'NOCHE', texto: 'Noche' },
          ])}
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
