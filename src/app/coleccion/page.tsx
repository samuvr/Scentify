/** Seccion 4.4 — Listado, buscador y filtros combinables. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import {
  listarColeccion,
  listarContextos,
  listarFamilias,
  marcasDeLaColeccion,
  notasDeLaColeccion,
  type FiltrosColeccion,
} from '@/servicios/consultas';
import { formatearFecha } from '@/componentes/BloquePromedios';
import { tonoDeFamilia } from '@/componentes/tono-familia';
import { Filtros } from './Filtros';
import { uuidOVacio } from '@/dominio/navegacion';

export const dynamic = 'force-dynamic';

const ORDENES = ['nombre', 'marca', 'ultimo-uso', 'mas-usado'] as const;

export default async function PaginaColeccion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const p = await searchParams;
  const filtros: FiltrosColeccion = {
    texto: p.q,
    estado: p.estado === 'LO_TUVE' || p.estado === 'LO_TENGO' ? p.estado : undefined,
    marca: p.marca,
    familiaId: uuidOVacio(p.familia),
    notaId: uuidOVacio(p.nota),
    contextoId: uuidOVacio(p.contexto),
    // Un valor desconocido en la URL se ignora: antes tumbaba la pantalla.
    estacion: (['PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO'] as const).find((e) => e === p.estacion),
    momento: (['DIA', 'NOCHE'] as const).find((m) => m === p.momento),
    valoracionMinima: Number(p.valoracion) >= 1 ? Math.min(5, Number(p.valoracion)) : undefined,
    incluirArchivados: p.archivados === '1',
    orden: (ORDENES as readonly string[]).includes(p.orden ?? '')
      ? (p.orden as FiltrosColeccion['orden'])
      : 'nombre',
  };

  const [perfumes, marcas, familias, contextos, notas] = await Promise.all([
    listarColeccion(userId, filtros),
    marcasDeLaColeccion(userId),
    listarFamilias(),
    listarContextos(userId),
    notasDeLaColeccion(userId),
  ]);
  const notaActiva = filtros.notaId ? notas.find((n) => n.id === filtros.notaId) : undefined;
  const familiaActiva = filtros.familiaId
    ? familias.find((f) => f.id === filtros.familiaId)
    : undefined;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="titulo">Colección</h1>
        <Link href="/coleccion/nuevo" className="boton-primario px-4 text-sm">
          + Añadir
        </Link>
      </header>

      <Filtros
        marcas={marcas}
        familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))}
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        notas={notas}
      />

      <p className="text-sm text-texto-tenue">
        {perfumes.length} {perfumes.length === 1 ? 'perfume' : 'perfumes'}
        {notaActiva ? ` con ${notaActiva.nombre}` : ''}
        {familiaActiva ? ` de la familia ${familiaActiva.nombre}` : ''}
      </p>

      {/*
        Filas y no tarjetas: con cincuenta perfumes, cincuenta cajas iguales son
        un muro. El filete de la izquierda lleva el tono de la familia principal,
        que es lo que hace reconocible cada fila sin leerla.
      */}
      <ul className="-mx-4 divide-y divide-borde/60 border-y border-borde/60">
        {perfumes.map((perfume) => {
          const tono = tonoDeFamilia(perfume.familiaPrincipal);
          return (
            <li key={perfume.id}>
              <Link
                href={`/coleccion/${perfume.id}`}
                className="flex items-stretch gap-3 px-4 py-3 transition active:bg-superficie-alta"
              >
                <span
                  aria-hidden="true"
                  className="w-1 shrink-0"
                  style={{ backgroundColor: tono ?? 'transparent' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="nombre-perfume truncate text-lg">{perfume.nombre}</p>
                  <p className="truncate text-sm text-texto-tenue">
                    {perfume.marca}
                    {perfume.concentracion ? ` · ${perfume.concentracion}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-texto-tenue">
                    {perfume.vecesUsado ? `${perfume.vecesUsado} usos` : 'Sin estrenar'}
                    {perfume.ultimoUso ? ` · último ${formatearFecha(perfume.ultimoUso)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center gap-1">
                  {perfume.valoracion ? (
                    <span className="text-sm text-texto-tenue">
                      <span aria-hidden="true">★ </span>
                      {perfume.valoracion}
                      <span className="sr-only"> de 5</span>
                    </span>
                  ) : null}
                  {perfume.estado === 'LO_TUVE' ? <span className="etiqueta">lo tuve</span> : null}
                  {perfume.archivado ? <span className="etiqueta">archivado</span> : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {perfumes.length === 0 ? (
        filtros.texto ? (
          <div className="tarjeta space-y-3 text-sm">
            <p>No tienes nada que se llame «{filtros.texto}».</p>
            <Link
              href={`/coleccion/nuevo?nombre=${encodeURIComponent(filtros.texto)}`}
              className="boton-secundario px-4 text-sm"
            >
              Añadirlo
            </Link>
          </div>
        ) : (
          <p className="tarjeta text-sm text-texto-tenue">
            Nada con estos filtros. Prueba a quitar alguno.
          </p>
        )
      ) : null}
    </div>
  );
}
