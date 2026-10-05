/**
 * Las tarjetas de recomendacion: explicacion en texto, promedios y las dos
 * acciones de la seccion 7.2.
 *
 * La primera va grande, como respuesta directa a "¿que me pongo?"; las demas,
 * en filas compactas debajo. Cada cosa se dice una vez: el motivo en texto, los
 * promedios en una linea y, solo en las parciales, que eje falla.
 *
 * "Me lo pongo" registra el uso de un toque, sin volver a pedir momento ni
 * contexto. "Otro" descarta la sugerencia durante el resto del dia y deja que
 * entre la siguiente de la lista.
 */
import { BotonEnviar } from '@/componentes/BotonEnviar';
import { PromediosEnLinea } from '@/componentes/BloquePromedios';
import { InsigniaIdoneidad } from '@/componentes/Idoneidad';
import { accionDescartarRecomendacion, accionRegistrarDesdeRecomendacion } from '../acciones';
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
  /**
   * Las estaciones elegidas a mano en la pantalla, si se han cambiado. Viajan
   * con el registro para que la idoneidad que se guarda sea la que se ha
   * visto; sin ellas, el servidor la calcula con el tiempo, como la pantalla.
   */
  estaciones?: Estacion[];
}

function MeLoPongo({
  perfumeId,
  momento,
  contextoId,
  fecha,
  estaciones,
  compacto = false,
}: Peticion & { perfumeId: string; compacto?: boolean }) {
  return (
    <form action={accionRegistrarDesdeRecomendacion} className={compacto ? '' : 'flex-1'}>
      {/*
        El id del uso sale con la pagina: si el formulario llega dos veces
        (doble toque, reintento del navegador), el servidor lo guarda una.
      */}
      <input type="hidden" name="id" value={crypto.randomUUID()} />
      <input type="hidden" name="perfumeId" value={perfumeId} />
      <input type="hidden" name="momento" value={momento} />
      <input type="hidden" name="contextoId" value={contextoId} />
      <input type="hidden" name="fecha" value={fecha} />
      {estaciones?.map((e) => (
        <input key={e} type="hidden" name="estacionesForzadas" value={e} />
      ))}
      <BotonEnviar
        pendiente="Guardando…"
        className={compacto ? 'boton-secundario px-4 text-sm' : 'boton-primario w-full'}
      >
        Me lo pongo
      </BotonEnviar>
    </form>
  );
}

function Otro({ perfumeId, compacto = false }: { perfumeId: string; compacto?: boolean }) {
  return (
    <form action={accionDescartarRecomendacion}>
      <input type="hidden" name="perfumeId" value={perfumeId} />
      <BotonEnviar
        aria-label="Otro: descartar por hoy"
        className={compacto ? 'boton-fantasma px-3 text-sm' : 'boton-secundario px-5'}
      >
        Otro
      </BotonEnviar>
    </form>
  );
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
          <p className="subtitulo">Hoy te pondría</p>
          <InsigniaIdoneidad pct={idoneidad.pct} />
        </div>
        <h2 className="nombre-perfume text-3xl">{perfume.nombre}</h2>
        <p className="text-texto-tenue">{perfume.marca}</p>
      </div>

      <AvisoParcial recomendacion={recomendacion} />
      <p>{motivo}</p>
      {perfume.promedios ? <PromediosEnLinea promedios={perfume.promedios} /> : null}

      <div className="flex gap-2">
        <MeLoPongo perfumeId={perfume.id} {...peticion} />
        <Otro perfumeId={perfume.id} />
      </div>
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
      <div className="flex items-center gap-2">
        <MeLoPongo perfumeId={perfume.id} {...peticion} compacto />
        <Otro perfumeId={perfume.id} compacto />
      </div>
    </li>
  );
}
