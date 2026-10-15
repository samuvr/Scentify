/**
 * El aviso de la noche: uno al dia como mucho, y que sirva para algo sin
 * abrir la app.
 *
 * Antes solo salia si no habia ningun uso, y solo abria la app con «¿Qué te
 * has puesto hoy?», cuando casi siempre la respuesta es «lo de ayer», que el
 * sistema ya sabe. Y si se habia registrado por la mañana, nadie preguntaba
 * la duracion ni la valoracion.
 *
 * - Sin registro hoy: «¿Qué te has puesto hoy?» con «Repetir: X» y «Lo de
 *   siempre: Y», que registran desde la propia notificacion.
 * - Con usos sin duracion o sin valorar: «¿Qué tal aguantó X?» con dos
 *   duraciones a un toque.
 * - Nada pendiente: no hay aviso.
 *
 * Funcion pura: el servicio le pasa lo que hay en la base.
 */
import type { DuracionPercibida, Momento } from './tipos';

export interface UsoParaAviso {
  id: string;
  nombre: string;
  valoracionDia: number | null;
  duracionPercibida: DuracionPercibida | null;
}

/** Lo que se registraria con un toque: un uso ya decidido. */
export interface PlantillaUso {
  perfumeId: string;
  nombre: string;
  momento: Momento;
  contextoId: string;
  /** Nombre del contexto, para la confirmacion «Apuntado: X · Día · Oficina». */
  contexto: string;
  sprays: number | null;
}

export interface AccionAviso {
  /** Identificador de la accion en la notificacion. */
  id: string;
  titulo: string;
  /** Registrar este uso hoy. */
  registrar?: PlantillaUso & { fecha: string };
  /** Completar la duracion de un uso ya registrado. */
  completar?: { usoId: string; duracionPercibida: DuracionPercibida };
}

export interface AvisoDiario {
  tipo: 'registrar' | 'cerrar';
  titulo: string;
  cuerpo: string;
  /** Al tocar el aviso donde hay botones (Android): no registra nada solo. */
  url: string;
  /**
   * Al tocar el aviso donde las notificaciones no tienen botones (iPhone): el
   * mismo toque que el boton principal, con su Deshacer en la app.
   */
  urlSinAcciones: string;
  acciones: AccionAviso[];
}

/** Las duraciones que se ofrecen en la notificacion: caben dos botones. */
const DURACIONES_DEL_AVISO: { valor: DuracionPercibida; titulo: string }[] = [
  { valor: 'DE_4_6H', titulo: '4-6 h' },
  { valor: 'MAS_8H', titulo: 'Más de 8 h' },
];

export function decidirAviso(entrada: {
  hoy: string;
  usosDeHoy: UsoParaAviso[];
  /** El ultimo uso de ayer, si lo hubo. */
  ayer: PlantillaUso | null;
  /** El perfume que mas te pones ultimamente, con su momento y contexto habituales. */
  habitual: PlantillaUso | null;
  /** «Pregúntame qué tal» activado. */
  preguntarCierre: boolean;
}): AvisoDiario | null {
  const { hoy, usosDeHoy, ayer, habitual } = entrada;

  if (usosDeHoy.length === 0) {
    const acciones: AccionAviso[] = [];
    if (ayer) {
      acciones.push({ id: 'repetir', titulo: `Repetir: ${ayer.nombre}`, registrar: { ...ayer, fecha: hoy } });
    }
    if (habitual && habitual.perfumeId !== ayer?.perfumeId) {
      acciones.push({
        id: 'habitual',
        titulo: `Lo de siempre: ${habitual.nombre}`,
        registrar: { ...habitual, fecha: hoy },
      });
    }
    return {
      tipo: 'registrar',
      titulo: '¿Qué te has puesto hoy?',
      cuerpo:
        acciones.length > 0
          ? 'Apúntalo desde aquí con un toque.'
          : 'Todavía no has registrado ningún perfume.',
      url: '/',
      // Sin botones, tocar el aviso repite el de ayer en la app, que deja
      // deshacerlo. Sin nada de ayer, solo abre Hoy.
      urlSinAcciones: ayer ? '/?toque=ayer' : '/',
      acciones,
    };
  }

  if (!entrada.preguntarCierre) return null;

  const sinCerrar = usosDeHoy.find((u) => u.duracionPercibida === null || u.valoracionDia === null);
  if (!sinCerrar) return null;

  // Si la duracion ya esta, los botones no sirven: solo se abre el cierre.
  const acciones: AccionAviso[] =
    sinCerrar.duracionPercibida === null
      ? DURACIONES_DEL_AVISO.map((d) => ({
          id: `duracion-${d.valor}`,
          titulo: d.titulo,
          completar: { usoId: sinCerrar.id, duracionPercibida: d.valor },
        }))
      : [];
  return {
    tipo: 'cerrar',
    titulo: `¿Qué tal aguantó ${sinCerrar.nombre}?`,
    cuerpo:
      acciones.length > 0
        ? 'Toca la duración, o ábrelo para valorar el día.'
        : 'Ábrelo para valorar el día con un toque.',
    url: '/?cierre=1',
    urlSinAcciones: '/?cierre=1',
    acciones,
  };
}

/** «Apuntado: Asad · Día · Oficina», la confirmacion tras registrar desde el aviso. */
export function textoApuntado(plantilla: PlantillaUso): string {
  return `Apuntado: ${plantilla.nombre} · ${plantilla.momento === 'DIA' ? 'Día' : 'Noche'} · ${plantilla.contexto}`;
}
