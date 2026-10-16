/** Seccion 4.3 — Ficha de perfume. */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { fichaDePerfume, listarContextos, nombreDePerfume } from '@/servicios/consultas';
import { BloquePromedios, DURACION_LEGIBLE, formatearFecha } from '@/componentes/BloquePromedios';
import { DesgloseIdoneidad, InsigniaIdoneidad } from '@/componentes/Idoneidad';
import { accionArchivar, accionCambiarEstado } from '@/app/acciones';
import { CompletarUso } from '@/componentes/CompletarUso';
import { ParecidosFragrantica } from '@/componentes/ParecidosFragrantica';
import { PropuestasMarcas } from '@/componentes/PropuestasMarcas';
import { VolverAColeccion } from '@/componentes/VolverAColeccion';
import { propuestasDeLaColeccion } from '@/servicios/recategorizacion';
import { hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';
import type { Estacion } from '@/dominio/tipos';
import { esUuid } from '@/dominio/navegacion';
import { fechaEnZona } from '@/dominio/zona';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const userId = await usuarioActual();
  const { id } = await params;
  const nombre = userId && esUuid(id) ? await nombreDePerfume(userId, id) : null;
  return { title: nombre ?? 'Perfume' };
}

/** Los ultimos usos que se ven sin pedirlo: la ficha de un perfume muy usado medía 11.668 px. */
const USOS_A_LA_VISTA = 10;

export const dynamic = 'force-dynamic';

const NOMBRE_ESTACION: Record<Estacion, string> = {
  PRIMAVERA: 'Primavera',
  VERANO: 'Verano',
  OTONO: 'Otoño',
  INVIERNO: 'Invierno',
};

export default async function PaginaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ historial?: string; guardado?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { id } = await params;
  if (!esUuid(id)) notFound();
  const { historial: verHistorial, guardado } = await searchParams;
  const zona = await zonaDelUsuario();
  const hoy = hoyIso(zona);
  const [ficha, contextos, propuestas] = await Promise.all([
    fichaDePerfume(userId, id),
    listarContextos(userId),
    propuestasDeLaColeccion(userId, hoy, id),
  ]);
  if (!ficha) notFound();

  const { perfume, notas, familias, parecidos, promedios, historial } = ficha;
  const todoElHistorial = verHistorial === 'todo';
  const usosVisibles = todoElHistorial ? historial : historial.slice(0, USOS_A_LA_VISTA);
  const disponible = perfume.estado === 'LO_TENGO' && !perfume.archivado;
  const nombreContexto = (contextoId: string) =>
    contextos.find((c) => c.id === contextoId)?.nombre ?? '—';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <VolverAColeccion />
        {guardado === 'sin-parecidos' ? (
          <p className="aviso-atencion" role="status">
            Ya lo tienes en tu colección, pero en lo enviado no venía «Esta fragancia me recuerda
            a». Puede que aún no se hubiera cargado: en Fragrantica, baja hasta ese bloque y vuelve
            a pulsar «Enviar a Scentify».
          </p>
        ) : guardado ? (
          <p className="aviso-hecho" role="status">
            {guardado === 'deseo'
              ? 'Añadido a tu colección y quitado de la wishlist.'
              : guardado === 'parecidos'
                ? 'Ya lo tenías: se ha actualizado «Esta fragancia me recuerda a».'
                : 'Cambios guardados.'}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="titulo">{perfume.nombre}</h1>
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
          {perfume.archivado ? <span className="etiqueta text-texto-tenue">Archivado</span> : null}
        </div>
        {/* Registrar desde la ficha: el mismo toque de Hoy, con su Deshacer. */}
        {disponible ? (
          <Link href={`/?toque=${perfume.id}`} className="boton-primario w-full">
            Me lo pongo hoy
          </Link>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="subtitulo">Promedios</h2>
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
        <h2 className="subtitulo">Pirámide</h2>
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
                  // Cada nota lleva a los perfumes de la coleccion que la tienen.
                  <Link
                    key={`${nivel}-${n.id}`}
                    href={`/coleccion?nota=${n.id}`}
                    className="etiqueta text-sm underline-offset-2 hover:underline"
                  >
                    {n.nombre}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {notas.length === 0 ? <p className="text-sm text-texto-tenue">Sin notas.</p> : null}
      </section>

      {parecidos ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Esta fragancia me recuerda a</h2>
          <ParecidosFragrantica
            perfumes={parecidos.perfumes}
            leidosEl={fechaEnZona(zona, new Date(parecidos.leidosEn))}
          />
        </section>
      ) : null}

      {propuestas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="subtitulo">Lo que haces y lo que marcaste</h2>
          <PropuestasMarcas propuestas={propuestas} contextos={contextos} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="subtitulo">Cómo lo tengo marcado</h2>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-texto-tenue">Familias: </span>
            {familias.length > 0
              ? familias.map((f, i) => (
                  <span key={f.id}>
                    {i > 0 ? ', ' : ''}
                    <Link href={`/coleccion?familia=${f.id}`} className="underline-offset-2 hover:underline">
                      {f.nombre}
                    </Link>
                  </span>
                ))
              : '—'}
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
          <h2 className="subtitulo">Notas personales</h2>
          <p className="whitespace-pre-line text-sm">{perfume.notasPersonales}</p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="subtitulo">Historial ({historial.length})</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-texto-tenue">Todavía no lo has usado.</p>
        ) : (
          <>
            {/* Una linea por uso; el desglose y «Completar» al desplegarlo. */}
            <ul className="divide-y divide-borde/70 border-y border-borde/70">
              {usosVisibles.map((uso) => (
                <li key={uso.id}>
                  <details className="group">
                    <summary className="flex min-h-tactil cursor-pointer list-none items-center justify-between gap-3 py-2">
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">{formatearFecha(uso.fecha)}</span>
                        <span className="text-texto-tenue">
                          {' '}
                          · {uso.momento === 'DIA' ? 'Día' : 'Noche'} · {uso.contexto}
                          {uso.valoracionDia !== null ? ` · ${uso.valoracionDia}/5` : ''}
                        </span>
                      </span>
                      <InsigniaIdoneidad pct={uso.idoneidadPct} />
                    </summary>
                    <div className="space-y-2 pb-3">
                      <p className="text-sm text-texto-tenue">
                        {NOMBRE_ESTACION[uso.estacionEfectiva]}
                        {uso.sprays !== null ? ` · ${uso.sprays} sprays` : ''}
                        {uso.duracionPercibida ? ` · ${DURACION_LEGIBLE[uso.duracionPercibida]}` : ''}
                      </p>
                      <DesgloseIdoneidad detalle={uso.idoneidadDetalle} />
                      {uso.comentario ? <p className="text-sm">{uso.comentario}</p> : null}
                      <CompletarUso
                        usoId={uso.id}
                        sprays={uso.sprays}
                        duracion={uso.duracionPercibida}
                        valoracion={uso.valoracionDia}
                        comentario={uso.comentario}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {historial.length > usosVisibles.length ? (
              <Link
                href={`/coleccion/${perfume.id}?historial=todo`}
                scroll={false}
                className="boton-fantasma w-full text-sm"
              >
                Ver los {historial.length}
              </Link>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-2 border-t border-borde pt-4">
        <h2 className="subtitulo">Acciones</h2>
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
