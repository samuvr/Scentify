/** Autenticacion simple: un solo usuario, creado con `npm run db:seed`. */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { FormularioLogin } from './FormularioLogin';

export const dynamic = 'force-dynamic';

export default async function PaginaLogin() {
  if (await usuarioActual()) redirect('/');
  return (
    <div className="space-y-6 pt-10">
      <header className="space-y-1 text-center">
        <h1 className="text-3xl font-bold text-ambar">Scentify</h1>
        <p className="text-sm text-texto-tenue">Mi colección de perfumes</p>
      </header>
      <FormularioLogin />
    </div>
  );
}
