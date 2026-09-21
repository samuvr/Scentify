/** Seccion 4.4 — Listado, buscador y filtros combinables. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import {
  listarColeccion,
  listarContextos,
  listarFamilias,
  marcasDeLaColeccion,
  type FiltrosColeccion,
} from '@/servicios/consultas';
import { formatearFecha } from '@/componentes/BloquePromedios';
import { Filtros } from './Filtros';

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
    familiaId: p.familia,
    contextoId: p.contexto,
    estacion: p.estacion as FiltrosColeccion['estacion'],
    momento: p.momento as FiltrosColeccion['momento'],
    valoracionMinima: p.valoracion ? Number(p.valoracion) : undefined,
    incluirArchivados: p.archivados === '1',
    orden: (ORDENES as readonly string[]).includes(p.orden ?? '')
      ? (p.orden as FiltrosColeccion['orden'])
      : 'nombre',
  };

  const [perfumes, marcas, familias, contextos] = await Promise.all([
    listarColeccion(userId, filtros),
    marcasDeLaColeccion(userId),
    listarFamilias(),
    listarContextos(userId),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Colección</h1>
        <Link href="/coleccion/nuevo" className="boton-primario px-4 text-sm">
          + Añadir
        </Link>
      </header>

      <Filtros
        marcas={marcas}
        familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))}
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />

      <p className="text-sm text-texto-tenue">
        {perfumes.length} {perfumes.length === 1 ? 'perfume' : 'perfumes'}
      </p>

      <ul className="space-y-2">
        {perfumes.map((perfume) => (
          <li key={perfume.id}>
            <Link href={`/coleccion/${perfume.id}`} className="tarjeta flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{perfume.nombre}</p>
                <p className="truncate text-sm text-texto-tenue">
                  {perfume.marca}
                  {perfume.concentracion ? ` · ${perfume.concentracion}` : ''}
                  {perfume.estado === 'LO_TUVE' ? ' · lo tuve' : ''}
                  {perfume.archivado ? ' · archivado' : ''}
                </p>
                <p className="text-xs text-texto-tenue">
                  {perfume.vecesUsado ?? 0} usos
                  {perfume.ultimoUso ? ` · último ${formatearFecha(perfume.ultimoUso)}` : ''}
                </p>
              </div>
              {perfume.valoracion ? (
                <span className="etiqueta text-xs">{perfume.valoracion}/5</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {perfumes.length === 0 ? (
        <p className="tarjeta text-sm text-texto-tenue">
          Nada con estos filtros. Prueba a quitar alguno o a importar tu colección desde
          Más → Datos.
        </p>
      ) : null}
    </div>
  );
}
