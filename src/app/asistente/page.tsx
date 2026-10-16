/** Asistente: preguntarle a Claude por la colección. */
import { redirect } from 'next/navigation';
import { asistenteDisponible } from '@/servicios/asistente';
import { usuarioActual } from '@/servicios/auth';
import { Chat } from './Chat';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Asistente' };

export const dynamic = 'force-dynamic';

export default async function PaginaAsistente() {
  if (!(await usuarioActual())) redirect('/login');

  return (
    <div className="space-y-5">
      <h1 className="titulo">Asistente</h1>
      {asistenteDisponible() ? (
        <Chat />
      ) : (
        <p className="tarjeta text-sm text-texto-tenue">
          El asistente necesita una clave de la API de Claude. Añade <code>ANTHROPIC_API_KEY</code> a
          las variables de entorno del despliegue y vuelve a desplegar.
        </p>
      )}
    </div>
  );
}
