/** Seccion 4.1 — Alta de perfume. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormularioPerfume } from '@/componentes/FormularioPerfume';
import { VALORES_VACIOS } from '@/componentes/valores-perfume';
import { desempaquetarFicha } from '@/dominio/ficha-compartida';
import { usuarioActual } from '@/servicios/auth';
import {
  fichaParaAlta,
  fichaPorUrl,
  listarContextos,
  listarFamilias,
  listarNotas,
  miFrascoDeFicha,
} from '@/servicios/consultas';

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
  const [contextos, familias, notas, fichaDeLaUrl] = await Promise.all([
    listarContextos(userId),
    listarFamilias(),
    listarNotas(),
    // Compartido desde Fragrantica: si alguien ya dio de alta esa misma
    // ficha, se usa tal cual en vez de volver a leerla.
    previos.url ? fichaPorUrl(previos.url) : null,
  ]);
  const [miFrasco, fichaCatalogo] = fichaDeLaUrl
    ? await Promise.all([miFrascoDeFicha(userId, fichaDeLaUrl), fichaParaAlta(fichaDeLaUrl)])
    : [null, null];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Añadir perfume</h1>
      {miFrasco ? (
        <p className="aviso-atencion">
          Este perfume ya está en tu colección.{' '}
          <Link href={`/coleccion/${miFrasco}`} className="underline">
            Ver el que tienes
          </Link>
        </p>
      ) : null}
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
        familias={familias.map((f) => ({ id: f.id, slug: f.slug, nombre: f.nombre }))}
        notasConocidas={notas.map((n) => n.nombre)}
        fichaInicial={desempaquetarFicha(previos.ficha)}
        fichaCatalogo={miFrasco ? null : fichaCatalogo}
      />
    </div>
  );
}
