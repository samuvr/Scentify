/** Seccion 4.3 — Ficha de perfume. */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { fichaDePerfume, listarContextos } from '@/servicios/consultas';
import { BloquePromedios, DURACION_LEGIBLE, formatearFecha } from '@/componentes/BloquePromedios';
import { DesgloseIdoneidad, InsigniaIdoneidad } from '@/componentes/Idoneidad';
import { accionArchivar, accionCambiarEstado } from '@/app/acciones';
import { CompletarUso } from './CompletarUso';
import type { Estacion } from '@/dominio/tipos';

export const dynamic = 'force-dynamic';

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};

export default async function PaginaFicha({ params }: { params: Promise<{ id: string }> }) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { id } = await params;
  const [ficha, contextos] = await Promise.all([
    fichaDePerfume(userId, id),
    listarContextos(userId),
  ]);
  if (!ficha) notFound();

  const { perfume, notas, familias, promedios, historial } = ficha;
  const nombreContexto = (contextoId: string) =>
    contextos.find((c) => c.id === contextoId)?.nombre ?? '—';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{perfume.nombre}</h1>
            <p className="text-texto-tenue">
              {perfume.marca}
              {perfume.concentracion ? ` · ${perfume.concentracion}` : ''}
              {perfume.anioLanzamiento ? ` · ${perfume.anioLanzamiento}` : ''}
            </p>
          </div>
          <Link href={`/coleccion/${perfume.id}/editar`} className="boton-secundario px-4 text-sm">
            Editar
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="etiqueta">{perfume.estado === 'LO_TENGO' ? 'Lo tengo' : 'Lo tuve'}</span>
          {perfume.volumenMl ? <span className="etiqueta">{perfume.volumenMl} ml</span> : null}
          {perfume.valoracion ? <span className="etiqueta">{perfume.valoracion}/5</span> : null}
          {perfume.archivado ? <span className="etiqueta text-id-parcial">Archivado</span> : null}
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Promedios</h2>
        <BloquePromedios
          promedios={promedios}
          vecesUsado={promedios.vecesUsado}
          ultimoUso={promedios.ultimoUso}
        />
        {ficha.contextoMasFrecuente || ficha.estacionMasFrecuente ? (
          <p className="text-sm text-texto-tenue">
            {ficha.contextoMasFrecuente
              ? `Contexto más frecuente: ${nombreContexto(ficha.contextoMasFrecuente)}. `
              : ''}
            {ficha.estacionMasFrecuente
              ? `Estación más frecuente: ${NOMBRE_ESTACION[ficha.estacionMasFrecuente]}.`
              : ''}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pirámide</h2>
        {(['SALIDA', 'CORAZON', 'FONDO'] as const).map((nivel) => {
          const delNivel = notas.filter((n) => n.nivel === nivel);
          if (delNivel.length === 0) return null;
          return (
            <div key={nivel}>
              <p className="text-sm text-texto-tenue">
                {nivel === 'SALIDA' ? 'Salida' : nivel === 'CORAZON' ? 'Corazón' : 'Fondo'}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {delNivel.map((n) => (
                  <span key={`${nivel}-${n.id}`} className="etiqueta text-sm">
                    {n.nombre}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {notas.length === 0 ? <p className="text-sm text-texto-tenue">Sin notas.</p> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cómo lo tengo marcado</h2>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-texto-tenue">Familias: </span>
            {familias.length > 0 ? familias.map((f) => f.nombre).join(', ') : '—'}
          </p>
          <p>
            <span className="text-texto-tenue">Estaciones: </span>
            {ficha.estaciones.map((e) => NOMBRE_ESTACION[e]).join(', ') || '—'}
          </p>
          <p>
            <span className="text-texto-tenue">Momento: </span>
            {ficha.momentos.map((m) => (m === 'DIA' ? 'Día' : 'Noche')).join(', ') || '—'}
          </p>
          <p>
            <span className="text-texto-tenue">Contextos: </span>
            {ficha.contextos.map(nombreContexto).join(', ') || '—'}
          </p>
        </div>
        {perfume.fragranticaUrl ? (
          <Link
            href={`/coleccion/${perfume.id}/editar?fragrantica=1`}
            className="boton-secundario w-full text-sm"
          >
            Volver a consultar Fragrantica
          </Link>
        ) : null}
      </section>

      {perfume.notasPersonales ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Notas personales</h2>
          <p className="whitespace-pre-line text-sm">{perfume.notasPersonales}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Historial ({historial.length})</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-texto-tenue">Todavía no lo has usado.</p>
        ) : (
          <ul className="space-y-2">
            {historial.map((uso) => (
              <li key={uso.id} className="tarjeta space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{formatearFecha(uso.fecha)}</p>
                    <p className="text-sm text-texto-tenue">
                      {uso.momento === 'DIA' ? 'Día' : 'Noche'} · {uso.contexto} ·{' '}
                      {NOMBRE_ESTACION[uso.estacionEfectiva]}
                      {uso.sprays !== null ? ` · ${uso.sprays} sprays` : ''}
                      {uso.duracionPercibida ? ` · ${DURACION_LEGIBLE[uso.duracionPercibida]}` : ''}
                      {uso.valoracionDia !== null ? ` · ${uso.valoracionDia}/5` : ''}
                    </p>
                  </div>
                  <InsigniaIdoneidad pct={uso.idoneidadPct} />
                </div>
                <DesgloseIdoneidad detalle={uso.idoneidadDetalle} />
                {uso.comentario ? <p className="text-sm">{uso.comentario}</p> : null}
                <CompletarUso
                  usoId={uso.id}
                  sprays={uso.sprays}
                  duracion={uso.duracionPercibida}
                  valoracion={uso.valoracionDia}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 border-t border-borde pt-4">
        <h2 className="text-lg font-semibold">Acciones</h2>
        <div className="flex flex-wrap gap-2">
          <form action={accionCambiarEstado}>
            <input type="hidden" name="perfumeId" value={perfume.id} />
            <input
              type="hidden"
              name="estado"
              value={perfume.estado === 'LO_TENGO' ? 'LO_TUVE' : 'LO_TENGO'}
            />
            <button type="submit" className="boton-secundario text-sm">
              Marcar como {perfume.estado === 'LO_TENGO' ? '«lo tuve»' : '«lo tengo»'}
            </button>
          </form>
          <form action={accionArchivar}>
            <input type="hidden" name="perfumeId" value={perfume.id} />
            <input type="hidden" name="archivar" value={perfume.archivado ? '0' : '1'} />
            <button type="submit" className="boton-secundario text-sm">
              {perfume.archivado ? 'Desarchivar' : 'Archivar'}
            </button>
          </form>
        </div>
        {/* Un perfume nunca se borra: hay usos que dependen de el. */}
        <p className="text-xs text-texto-tenue">
          Los perfumes no se borran, se archivan: el historial de usos depende de ellos.
        </p>
      </section>
    </div>
  );
}
