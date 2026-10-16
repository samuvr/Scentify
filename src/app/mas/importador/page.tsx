/**
 * Instalacion del boton «Enviar a Scentify» (ver `src/dominio/importador.ts`).
 *
 * Es la forma de traer una ficha de Fragrantica que no depende de que
 * Cloudflare deje pasar al servidor, ni de copiar y pegar la pagina entera.
 */
import { redirect } from 'next/navigation';
import { busquedaEnFragrantica, esUrlDeFichaValida } from '@/dominio/fragrantica';
import { usuarioActual } from '@/servicios/auth';
import { parecidosPendientes } from '@/servicios/consultas';
import { InstalarBoton } from './InstalarBoton';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Importador' };

export const dynamic = 'force-dynamic';

export default async function PaginaImportador() {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');
  const { total, pendientes } = await parecidosPendientes(userId);

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

      {/*
        Los perfumes de antes no tienen «Esta fragancia me recuerda a» y no se
        puede traer en lote: solo llega desde el navegador, ficha a ficha.
        Con el boton sobre un perfume que ya tienes se guarda en su ficha.
      */}
      {total > 0 ? (
        <section className="space-y-3">
          <h2 className="subtitulo">Completar los que ya tienes</h2>
          {pendientes.length === 0 ? (
            <p className="aviso-hecho">
              Todos tus perfumes tienen «Esta fragancia me recuerda a».
            </p>
          ) : (
            <>
              <p className="text-sm text-texto-tenue">
                A {pendientes.length === total ? 'todos los' : `${pendientes.length} de los ${total}`}{' '}
                perfumes de tu colección les falta «Esta fragancia me recuerda a». Abre cada uno
                en Fragrantica, baja hasta ese bloque y pulsa el botón: se guarda en su ficha y
                sale de esta lista. Si en Fragrantica no tiene ese bloque, se queda aquí.
              </p>
              <ul className="divide-y divide-borde/70 border-y border-borde/70">
                {pendientes.map((p) => {
                  // La ficha es de todos: solo se enlaza si de verdad es de Fragrantica.
                  const suya = p.fragranticaUrl && esUrlDeFichaValida(p.fragranticaUrl);
                  return (
                    <li key={p.id} className="flex min-h-tactil items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{p.nombre}</span>
                        <span className="block truncate text-sm text-texto-tenue">
                          {[p.marca, p.concentracion].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <a
                        href={suya ? p.fragranticaUrl! : busquedaEnFragrantica(p.nombre, p.marca)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-sm underline"
                      >
                        {suya ? 'Abrir en Fragrantica' : 'Buscar en Fragrantica'}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
