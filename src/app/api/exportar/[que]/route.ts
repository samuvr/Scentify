/**
 * Descargas de la seccion 9: CSV de coleccion, CSV de usos, copia JSON, JSON
 * para IA y la hoja Excel para actualizar la coleccion.
 */
import { usuarioActual } from '@/servicios/auth';
import { leerConfiguracion } from '@/servicios/ajustes';
import {
  copiaCompleta,
  exportarColeccionCsv,
  exportarColeccionIa,
  exportarUsosCsv,
} from '@/servicios/datos';
import { exportarHojaActualizacion } from '@/servicios/hoja-actualizacion';

const HOY = () => new Date().toISOString().slice(0, 10);

export async function GET(_p: Request, contexto: { params: Promise<{ que: string }> }) {
  const userId = await usuarioActual();
  if (!userId) return new Response('No autenticado', { status: 401 });

  const { que } = await contexto.params;

  const descarga = (cuerpo: string | Blob, nombre: string, tipo: string) =>
    new Response(cuerpo, {
      headers: {
        'content-type': typeof cuerpo === 'string' ? `${tipo}; charset=utf-8` : tipo,
        'content-disposition': `attachment; filename="${nombre}"`,
        'cache-control': 'no-store',
      },
    });

  switch (que) {
    case 'coleccion':
      return descarga(await exportarColeccionCsv(userId), `scentify-coleccion-${HOY()}.csv`, 'text/csv');
    case 'hoja':
      return descarga(
        new Blob([new Uint8Array(await exportarHojaActualizacion(userId))]),
        `scentify-coleccion-${HOY()}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    case 'usos':
      return descarga(await exportarUsosCsv(userId), `scentify-usos-${HOY()}.csv`, 'text/csv');
    case 'copia':
      return descarga(
        JSON.stringify(await copiaCompleta(userId), null, 2),
        `scentify-copia-${HOY()}.json`,
        'application/json',
      );
    case 'ia': {
      // Si la ubicacion automatica no se ha podido detectar, mejor no decir
      // nada que mandar a la IA a mirar el tiempo de la ciudad por defecto.
      const { ubicacion, ubicacionDetectada } = await leerConfiguracion(userId);
      return descarga(
        JSON.stringify(
          await exportarColeccionIa(userId, ubicacionDetectada ? ubicacion.etiqueta : null, HOY()),
          null,
          2,
        ),
        `scentify-coleccion-ia-${HOY()}.json`,
        'application/json',
      );
    }
    default:
      return new Response('No encontrado', { status: 404 });
  }
}
