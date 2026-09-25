/** Autenticacion simple. Las cuentas nuevas se crean en /registro. */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { registroAbierto, usuarioActual } from '@/servicios/auth';
import { FormularioLogin } from './FormularioLogin';

export const dynamic = 'force-dynamic';

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  if (await usuarioActual()) redirect('/');
  const { siguiente } = await searchParams;
  return (
    <div className="space-y-6 pt-10">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-5xl font-semibold tracking-tight text-acento">Scentify</h1>
        <p className="text-sm text-texto-tenue">Mi colección de perfumes</p>
      </header>
      <FormularioLogin siguiente={siguiente} />
      {registroAbierto() ? (
        <p className="text-center text-sm text-texto-tenue">
          ¿Te han invitado?{' '}
          <Link
            href={siguiente ? `/registro?siguiente=${encodeURIComponent(siguiente)}` : '/registro'}
            className="text-acento underline"
          >
            Crea tu cuenta
          </Link>
        </p>
      ) : null}
    </div>
  );
}
