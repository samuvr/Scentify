/** Seccion 4.1 — Alta de perfume. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormularioPerfume } from '@/componentes/FormularioPerfume';
import { VALORES_VACIOS } from '@/componentes/valores-perfume';
import { desempaquetarFicha } from '@/dominio/ficha-compartida';
import { datosDeUrlFragrantica } from '@/dominio/fragrantica';
import { esUuid } from '@/dominio/navegacion';
import { usuarioActual } from '@/servicios/auth';
import { claudeDisponible } from '@/servicios/claude';
import {
  fichaParaAlta,
  fichaPorUrl,
  listarContextos,
  listarFamilias,
  listarNotas,
  miFrascoDeFicha,
} from '@/servicios/consultas';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Añadir perfume' };

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
    deseo?: string;
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
  // El enlace pegado en el alta llega solo: el nombre y la marca, de el.
  const desdeUrl = previos.url ? datosDeUrlFragrantica(previos.url) : null;

  return (
    <div className="space-y-5">
      <h1 className="titulo">Añadir perfume</h1>
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
        // Pegar un enlace en el alta vuelve aqui con la URL: el formulario se
        // monta de nuevo, con lo que trae, y lee la ficha al abrirse.
        key={previos.url ?? ''}
        // Prerrellenado al convertir un deseo de la wishlist (4.5).
        iniciales={{
          ...VALORES_VACIOS,
          nombre: previos.nombre || desdeUrl?.nombre || '',
          marca: previos.marca || desdeUrl?.marca || '',
          fragranticaUrl: previos.url ?? '',
        }}
        contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
        familias={familias.map((f) => ({ id: f.id, slug: f.slug, nombre: f.nombre }))}
        notasConocidas={notas.map((n) => n.nombre)}
        fichaInicial={desempaquetarFicha(previos.ficha)}
        fichaCatalogo={miFrasco ? null : fichaCatalogo}
        sugerirConIa={claudeDisponible()}
        deseoId={esUuid(previos.deseo) ? previos.deseo : undefined}
      />
    </div>
  );
}
