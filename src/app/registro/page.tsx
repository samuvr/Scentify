/**
 * Alta de cuentas nuevas, solo con codigo de invitacion.
 *
 * El codigo puede venir ya en el enlace (/registro?codigo=...), que es lo
 * comodo para pasarselo a alguien por mensaje.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { registroAbierto, usuarioActual } from '@/servicios/auth';
import { FormularioRegistro } from './FormularioRegistro';

export const dynamic = 'force-dynamic';

export default async function PaginaRegistro({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string; siguiente?: string }>;
}) {
  if (await usuarioActual()) redirect('/');
  const { codigo, siguiente } = await searchParams;
  const abierto = registroAbierto();

  return (
    <div className="space-y-6 pt-10">
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold text-acento">Scentify</h1>
        <p className="text-sm text-texto-tenue">Crea tu cuenta</p>
      </header>
      {abierto ? (
        <FormularioRegistro codigo={codigo} siguiente={siguiente} />
      ) : (
        <p className="tarjeta text-sm text-texto-tenue">
          El registro está cerrado. Pide acceso a quien te pasó la app.
        </p>
      )}
      <p className="text-center text-sm text-texto-tenue">
        ¿Ya tienes cuenta?{' '}
        <Link
          href={siguiente ? `/login?siguiente=${encodeURIComponent(siguiente)}` : '/login'}
          className="text-acento underline"
        >
          Entra
        </Link>
      </p>
    </div>
  );
}
