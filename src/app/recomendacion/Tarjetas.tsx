/**
 * Las tarjetas de recomendacion: explicacion en texto, promedios y las dos
 * acciones de la seccion 7.2.
 *
 * La primera va grande, como respuesta directa a "¿que me pongo?"; las demas,
 * en filas compactas debajo. Cada cosa se dice una vez: el motivo en texto, los
 * promedios en una linea y, solo en las parciales, que eje falla.
 *
 * "Me lo pongo" registra el uso de un toque, sin volver a pedir momento ni
 * contexto, y sin conexion lo deja en la cola del movil. "Otro" descarta la
 * sugerencia durante el resto del dia y deja que entre la siguiente.
 */
import { PromediosEnLinea } from '@/componentes/BloquePromedios';
import { InsigniaIdoneidad } from '@/componentes/Idoneidad';
import { AccionesRecomendacion } from './AccionesRecomendacion';
import type { Recomendacion } from '@/dominio/recomendacion';
import type { Estacion, Momento } from '@/dominio/tipos';

const NOMBRE_EJE: Record<string, string> = {
  momento: 'momento',
  contexto: 'contexto',
  estacion: 'estación',
};

interface Peticion {
  momento: Momento;
  contextoId: string;
  fecha: string;
  /** Sugerencia para mañana: el uso se apunta con la fecha de mañana. */
  paraManana?: boolean;
  /**
   * Las estaciones elegidas a mano en la pantalla, si se han cambiado. Viajan
   * con el registro para que la idoneidad que se guarda sea la que se ha
   * visto; sin ellas, el servidor la calcula con el tiempo, como la pantalla.
   */
  estaciones?: Estacion[];
}

/**
 * La marca de coincidencia parcial. Solo nombra el eje que falla: la frase de
 * por que ya va en el motivo, y repetirla seria decir lo mismo dos veces.
 */
function AvisoParcial({ recomendacion }: { recomendacion: Recomendacion }) {
  if (!recomendacion.parcial) return null;
  return (
    <p className="subtitulo text-id-parcial">
      Parcial · falla {recomendacion.ejesQueFallan.map((eje) => NOMBRE_EJE[eje]).join(' y ')}
    </p>
  );
}

/** La primera sugerencia, en grande. */
export function TarjetaPrincipal({
  recomendacion,
  ...peticion
}: Peticion & { recomendacion: Recomendacion }) {
  const { perfume, idoneidad, motivo } = recomendacion;

  return (
    <article
      className={`tarjeta space-y-4 p-5 ${recomendacion.parcial ? 'border-dashed border-id-parcial/60' : 'border-acento/50'}`}
    >
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <p className="subtitulo">{peticion.paraManana ? 'Mañana te pondría' : 'Hoy te pondría'}</p>
          <InsigniaIdoneidad pct={idoneidad.pct} />
        </div>
        <h2 className="nombre-perfume text-3xl">{perfume.nombre}</h2>
        <p className="text-texto-tenue">{perfume.marca}</p>
      </div>

      <AvisoParcial recomendacion={recomendacion} />
      <p>{motivo}</p>
      {perfume.promedios ? <PromediosEnLinea promedios={perfume.promedios} /> : null}

      <AccionesRecomendacion
        perfumeId={perfume.id}
        nombre={perfume.nombre}
        sprays={perfume.promedios?.spraysHabituales ?? null}
        {...peticion}
      />
    </article>
  );
}

/** Las siguientes, en filas compactas. */
export function FilaRecomendacion({
  recomendacion,
  ...peticion
}: Peticion & { recomendacion: Recomendacion }) {
  const { perfume, idoneidad, motivo } = recomendacion;

  return (
    <li className="space-y-2 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="nombre-perfume text-lg">{perfume.nombre}</p>
          <p className="text-sm text-texto-tenue">{perfume.marca}</p>
        </div>
        <InsigniaIdoneidad pct={idoneidad.pct} />
      </div>
      <AvisoParcial recomendacion={recomendacion} />
      <p className="text-sm text-texto-tenue">{motivo}</p>
      {perfume.promedios ? <PromediosEnLinea promedios={perfume.promedios} /> : null}
      <AccionesRecomendacion
        perfumeId={perfume.id}
        nombre={perfume.nombre}
        sprays={perfume.promedios?.spraysHabituales ?? null}
        {...peticion}
        compacto
      />
    </li>
  );
}
