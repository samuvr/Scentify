/** Seccion 4.1 — Alta de perfume. */
import { redirect } from 'next/navigation';
import { FormularioPerfume } from '@/componentes/FormularioPerfume';
import { VALORES_VACIOS } from '@/componentes/valores-perfume';
import { desempaquetarFicha } from '@/dominio/ficha-compartida';
import { usuarioActual } from '@/servicios/auth';
import { listarContextos, listarFamilias, listarNotas } from '@/servicios/consultas';

export const dynamic = 'force-dynamic';

export default async function PaginaNuevoPerfume({
  searchParams,
}: {
  searchParams: Promise<{
    nombre?: string;
    marca?: string;
    url?: string;
    compartido?: string;
    ficha?: string;
  }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const previos = await searchParams;
  const [contextos, familias, notas] = await Promise.all([
    listarContextos(userId),
    listarFamilias(),
    listarNotas(),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Añadir perfume</h1>
      {previos.compartido === 'no-reconocido' ? (
        <p className="aviso-atencion">
          Lo compartido no era una ficha de Fragrantica. Sigue a mano: no falta nada por hacer,
          solo no se ha podido adelantar ningún dato.
        </p>
      ) : null}
      <FormularioPerfume
        // Prerrellenado al convertir un deseo de la wishlist (4.5).
        iniciales={{
          ...VALORES_VACIOS,
          nombre: previos.nombre ?? '',
          marca: previos.marca ?? '',
          fragranticaUrl: previos.url ?? '',
        }}
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))}
        notasConocidas={notas.map((n) => n.nombre)}
        fichaInicial={desempaquetarFicha(previos.ficha)}
      />
    </div>
  );
}
