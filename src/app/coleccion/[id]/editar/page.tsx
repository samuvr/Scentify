/**
 * Edicion de la ficha: abre en la revision de una pantalla, con los pasos a
 * mano para corregir. Con ?fragrantica=1 vuelve a leer la ficha guardada.
 */
import { notFound, redirect } from 'next/navigation';
import { FormularioPerfume } from '@/componentes/FormularioPerfume';
import type { ValoresPerfume } from '@/componentes/valores-perfume';
import { usuarioActual } from '@/servicios/auth';
import { claudeDisponible } from '@/servicios/claude';
import {
  fichaDePerfume,
  listarContextos,
  listarFamilias,
  listarNotas,
  nombreDePerfume,
} from '@/servicios/consultas';
import { esUuid } from '@/dominio/navegacion';
import { hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const userId = await usuarioActual();
  const { id } = await params;
  const nombre = userId && esUuid(id) ? await nombreDePerfume(userId, id) : null;
  return { title: nombre ? `Editar ${nombre}` : 'Editar perfume' };
}

export const dynamic = 'force-dynamic';

export default async function PaginaEditar({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fragrantica?: string; comprado?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { id } = await params;
  const { fragrantica, comprado } = await searchParams;
  if (!esUuid(id)) notFound();
  const [ficha, contextos, familias, notas] = await Promise.all([
    fichaDePerfume(userId, id),
    listarContextos(userId),
    listarFamilias(),
    listarNotas(),
  ]);
  if (!ficha) notFound();
  // «Lo he comprado» desde una muestra: pasa a la coleccion al guardar, con la
  // compra fechada hoy y el inventario abierto para el volumen.
  const recienComprado = comprado === '1' && ficha.perfume.estado === 'MUESTRA';

  const iniciales: ValoresPerfume = {
    nombre: ficha.perfume.nombre,
    marca: ficha.perfume.marca,
    concentracion: ficha.perfume.concentracion ?? '',
    anioLanzamiento: ficha.perfume.anioLanzamiento?.toString() ?? '',
    volumenMl: ficha.perfume.volumenMl?.toString() ?? '',
    fechaCompra: ficha.perfume.fechaCompra ?? (recienComprado ? hoyIso(await zonaDelUsuario()) : ''),
    estado: recienComprado ? 'LO_TENGO' : ficha.perfume.estado,
    valoracion: ficha.perfume.valoracion?.toString() ?? '',
    notasPersonales: ficha.perfume.notasPersonales ?? '',
    fragranticaUrl: ficha.perfume.fragranticaUrl ?? '',
    notas: ficha.notas.map((n) => ({ nombre: n.nombre, nivel: n.nivel })),
    familiaIds: ficha.familias.map((f) => f.id),
    contextoIds: ficha.contextos,
    estaciones: ficha.estaciones,
    momentos: ficha.momentos,
  };

  return (
    <div className="space-y-5">
      <h1 className="titulo">Editar {ficha.perfume.nombre}</h1>
      <FormularioPerfume
        perfumeId={ficha.perfume.id}
        iniciales={iniciales}
        compartidaCon={ficha.compartidaCon}
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        familias={familias.map((f) => ({ id: f.id, slug: f.slug, nombre: f.nombre }))}
        notasConocidas={notas.map((n) => n.nombre)}
        sugerirConIa={claudeDisponible()}
        consultarAlAbrir={fragrantica === '1' && Boolean(iniciales.fragranticaUrl)}
        recienComprado={recienComprado}
      />
    </div>
  );
}
