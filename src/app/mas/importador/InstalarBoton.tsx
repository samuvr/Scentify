'use client';

/**
 * El enlace que se arrastra a la barra de marcadores, y los codigos para
 * copiar donde no se puede arrastrar (el movil y el Atajo de iOS).
 *
 * React 19 no deja poner un `javascript:` en el `href` de un enlace: lo
 * cambia por uno que lanza un error. Aqui es justo lo que se quiere, asi que
 * se pone a mano en el DOM despues de montar.
 */
import { useEffect, useRef, useState } from 'react';
import { codigoAtajo, codigoMarcador } from '@/dominio/importador';

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      disabled={!texto}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setHecho(true);
          setTimeout(() => setHecho(false), 2000);
        } catch {
          // Sin permiso de portapapeles queda el codigo a la vista para copiarlo.
        }
      }}
      className="boton-secundario w-full"
    >
      {hecho ? 'Copiado' : etiqueta}
    </button>
  );
}

export function InstalarBoton() {
  const enlace = useRef<HTMLAnchorElement>(null);
  const [marcador, setMarcador] = useState('');
  const [origen, setOrigen] = useState('');

  useEffect(() => {
    const codigo = codigoMarcador(window.location.origin);
    setOrigen(window.location.origin);
    setMarcador(codigo);
    enlace.current?.setAttribute('href', codigo);
  }, []);

  return (
    <div className="space-y-6">
      <section className="tarjeta space-y-3">
        <h2 className="subtitulo">En el ordenador</h2>
        <p className="text-sm text-texto-tenue">
          Arrastra este botón a la barra de marcadores. Luego, con la ficha de un perfume abierta
          en Fragrantica, púlsalo: se abre el alta con las notas, los acordes y los votos ya puestos.
        </p>
        {/* El href lo pone el efecto de arriba. */}
        <a
          ref={enlace}
          onClick={(e) => e.preventDefault()}
          className="boton-primario block w-full cursor-grab text-center"
        >
          Enviar a Scentify
        </a>
        <p className="text-xs text-texto-tenue">
          Si no ves la barra de marcadores: Ctrl+Mayús+B (⌘+Mayús+B en Mac).
        </p>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="subtitulo">En el iPhone (Atajos)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-texto-tenue">
          <li>
            Abre la app <strong className="text-texto">Atajos</strong> y crea uno nuevo llamado
            «Enviar a Scentify».
          </li>
          <li>
            En sus ajustes (ⓘ), activa <strong className="text-texto">Mostrar en hoja de
            compartir</strong> y deja que reciba solo páginas web de Safari.
          </li>
          <li>
            Añade la acción <strong className="text-texto">Ejecutar JavaScript en página web</strong>{' '}
            y pega dentro este código, sustituyendo el que trae:
          </li>
        </ol>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-superficie-alta p-3 text-xs">
          {codigoAtajo()}
        </pre>
        <Copiar texto={codigoAtajo()} etiqueta="Copiar el código del atajo" />
        <ol start={4} className="list-decimal space-y-2 pl-5 text-sm text-texto-tenue">
          <li>
            Añade la acción <strong className="text-texto">Texto</strong> con{' '}
            <code className="break-all text-texto">{origen}/importar#</code> y, justo detrás,
            la variable <em>Resultado de JavaScript</em>.
          </li>
          <li>
            Termina con <strong className="text-texto">Abrir URL</strong>, que recibe ese texto.
          </li>
        </ol>
        <p className="text-sm text-texto-tenue">
          Desde entonces, en una ficha de Fragrantica en Safari: Compartir → Enviar a Scentify.
        </p>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="subtitulo">En Android</h2>
        <p className="text-sm text-texto-tenue">
          Con la app instalada, selecciona todo el texto de la ficha y dale a{' '}
          <strong className="text-texto">Compartir → Scentify</strong>. Si prefieres el botón,
          crea un marcador cualquiera en Chrome, edítalo y pon este código como URL; se lanza
          escribiendo su nombre en la barra de direcciones.
        </p>
        <Copiar texto={marcador} etiqueta="Copiar el código del botón" />
      </section>
    </div>
  );
}
