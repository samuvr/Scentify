/**
 * ¿Merece la pena comprarlo? Los mismos pasos que el alta (enlace de
 * Fragrantica, notas, estaciones, momentos y contextos) y, en vez de guardar,
 * que aportaria a la coleccion: si llena casillas flojas del reparto o cae
 * donde ya vas servido, y si se parece a algo que ya tienes. No se guarda
 * nada salvo que se pulse «Lo he comprado» o «Guardar en la wishlist».
 *
 * Acepta los mismos parametros que el alta, para llegar desde la wishlist o
 * desde «Compartir → Scentify» con lo que ya se sabe.
 */
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

export const metadata: Metadata = { title: '¿Merece la pena?' };

export const dynamic = 'force-dynamic';

export default async function PaginaEvaluar({
  searchParams,
}: {
  searchParams: Promise<{
    nombre?: string;
    marca?: string;
    url?: string;
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
    previos.url ? fichaPorUrl(previos.url) : null,
  ]);
  const [miFrasco, fichaCatalogo] = fichaDeLaUrl
    ? await Promise.all([miFrascoDeFicha(userId, fichaDeLaUrl), fichaParaAlta(fichaDeLaUrl)])
    : [null, null];
  const desdeUrl = previos.url ? datosDeUrlFragrantica(previos.url) : null;
  const sinFrecuencia = contextos.every((c) => c.usosSemana === null);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">¿Merece la pena?</h1>
        <p className="text-sm text-texto-tenue">
          Pega el enlace de Fragrantica y marca para qué lo usarías. Te digo si llena huecos de tu
          colección o cae donde ya vas servido. No se guarda nada hasta que lo compres.
        </p>
      </header>
      {miFrasco ? (
        <p className="aviso-atencion">
          Este perfume ya está en tu colección.{' '}
          <Link href={`/coleccion/${miFrasco}`} className="underline">
            Ver el que tienes
          </Link>
        </p>
      ) : null}
      {sinFrecuencia ? (
        <p className="aviso-atencion">
          Ninguno de tus contextos tiene dicho cuántas veces lo usas a la semana, y sin eso no se
          puede valorar.{' '}
          <Link href="/mas/configuracion" className="underline">
            Ponlo en Configuración
          </Link>
        </p>
      ) : null}
      <FormularioPerfume
        key={previos.url ?? ''}
        evaluar
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
        yaLoTengo={Boolean(miFrasco)}
        sugerirConIa={claudeDisponible()}
        deseoId={esUuid(previos.deseo) ? previos.deseo : undefined}
      />
    </div>
  );
}
