/** Edicion de la ficha: los mismos pasos del alta, ya rellenos. */
import { notFound, redirect } from 'next/navigation';
import { FormularioPerfume, type ValoresPerfume } from '@/componentes/FormularioPerfume';
import { usuarioActual } from '@/servicios/auth';
import { fichaDePerfume, listarContextos, listarFamilias, listarNotas } from '@/servicios/consultas';

export const dynamic = 'force-dynamic';

export default async function PaginaEditar({ params }: { params: Promise<{ id: string }> }) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { id } = await params;
  const [ficha, contextos, familias, notas] = await Promise.all([
    fichaDePerfume(userId, id),
    listarContextos(userId),
    listarFamilias(),
    listarNotas(),
  ]);
  if (!ficha) notFound();

  const iniciales: ValoresPerfume = {
    nombre: ficha.perfume.nombre,
    marca: ficha.perfume.marca,
    concentracion: ficha.perfume.concentracion ?? '',
    anioLanzamiento: ficha.perfume.anioLanzamiento?.toString() ?? '',
    volumenMl: ficha.perfume.volumenMl?.toString() ?? '',
    fechaCompra: ficha.perfume.fechaCompra ?? '',
    estado: ficha.perfume.estado,
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
      <h1 className="text-2xl font-bold">Editar {ficha.perfume.nombre}</h1>
      <FormularioPerfume
        perfumeId={ficha.perfume.id}
        iniciales={iniciales}
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))}
        notasConocidas={notas.map((n) => n.nombre)}
      />
    </div>
  );
}
