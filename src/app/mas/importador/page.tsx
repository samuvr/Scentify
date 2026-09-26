/**
 * Instalacion del boton «Enviar a Scentify» (ver `src/dominio/importador.ts`).
 *
 * Es la forma de traer una ficha de Fragrantica que no depende de que
 * Cloudflare deje pasar al servidor, ni de copiar y pegar la pagina entera.
 */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { InstalarBoton } from './InstalarBoton';

export const dynamic = 'force-dynamic';

export default async function PaginaImportador() {
  if (!(await usuarioActual())) redirect('/login');

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="titulo">Botón de Fragrantica</h1>
        <p className="text-sm text-texto-tenue">
          Un botón que pulsas con la ficha abierta en Fragrantica. Lee la página en tu navegador,
          así que no le afecta el bloqueo, y no hay que copiar ni pegar nada.
        </p>
      </header>
      <InstalarBoton />
    </div>
  );
}
