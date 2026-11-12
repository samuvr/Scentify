/**
 * Registro de una muestra: un decant, una muestra o el probador del
 * aeropuerto. Se pega el enlace de Fragrantica y se lee la ficha igual que en
 * un alta; al guardar, el perfume queda con estado MUESTRA (fuera de la
 * coleccion, por si se compra algun dia) y se pasa a registrar el uso.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormularioPerfume } from '@/componentes/FormularioPerfume';
import { VALORES_VACIOS } from '@/componentes/valores-perfume';
import { esFechaIso } from '@/dominio/navegacion';
import { datosDeUrlFragrantica } from '@/dominio/fragrantica';
import { usuarioActual } from '@/servicios/auth';
import { claudeDisponible } from '@/servicios/claude';
import {
  fichaParaAlta,
  fichaPorUrl,
  listarContextos,
  listarFamilias,
  listarNotas,
  loQueTengoDeFicha,
} from '@/servicios/consultas';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Muestra' };

export const dynamic = 'force-dynamic';

export default async function PaginaMuestra({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; fecha?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const previos = await searchParams;
  const fecha = previos.fecha && esFechaIso(previos.fecha) ? previos.fecha : undefined;
  const [contextos, familias, notas, fichaDeLaUrl] = await Promise.all([
    listarContextos(userId),
    listarFamilias(),
    listarNotas(),
    previos.url ? fichaPorUrl(previos.url) : null,
  ]);
  const [loMio, fichaCatalogo] = fichaDeLaUrl
    ? await Promise.all([loQueTengoDeFicha(userId, fichaDeLaUrl), fichaParaAlta(fichaDeLaUrl)])
    : [null, null];
  const desdeUrl = previos.url ? datosDeUrlFragrantica(previos.url) : null;
  const registrar = (id: string) =>
    fecha ? `/mas/calendario/${fecha}?elegir=${id}` : `/?elegir=${id}`;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">Muestra</h1>
        <p className="text-sm text-texto-tenue">
          Un decant, una muestra o el probador de una tienda. Pega el enlace de Fragrantica: se
          guarda con toda su información por si lo compras algún día, pero no entra en tu
          colección.
        </p>
      </header>

      {/* Ya guardado (como frasco o como otra muestra): basta con registrar el uso. */}
      {loMio ? (
        <div className="tarjeta space-y-3">
          <p>
            {loMio.estado === 'MUESTRA'
              ? 'Ya lo probaste antes con una muestra: está guardado.'
              : 'Este perfume ya está en tu colección.'}
          </p>
          <Link href={registrar(loMio.id)} className="boton-primario w-full">
            Registrar el uso
          </Link>
        </div>
      ) : (
        <FormularioPerfume
          key={previos.url ?? ''}
          muestra
          fechaMuestra={fecha}
          iniciales={{
            ...VALORES_VACIOS,
            estado: 'MUESTRA',
            nombre: desdeUrl?.nombre || '',
            marca: desdeUrl?.marca || '',
            fragranticaUrl: previos.url ?? '',
          }}
          contextos={contextos.map((c) => ({ id: c.id, nombre: c.nombre }))}
          familias={familias.map((f) => ({ id: f.id, slug: f.slug, nombre: f.nombre }))}
          notasConocidas={notas.map((n) => n.nombre)}
          fichaCatalogo={fichaCatalogo}
          sugerirConIa={claudeDisponible()}
        />
      )}
    </div>
  );
}
