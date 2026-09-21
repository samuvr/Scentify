/** Descargas de la seccion 9: CSV de coleccion, CSV de usos y copia JSON. */
import { usuarioActual } from '@/servicios/auth';
import { copiaCompleta, exportarColeccionCsv, exportarUsosCsv } from '@/servicios/datos';

const HOY = () => new Date().toISOString().slice(0, 10);

export async function GET(_p: Request, contexto: { params: Promise<{ que: string }> }) {
  const userId = await usuarioActual();
  if (!userId) return new Response('No autenticado', { status: 401 });

  const { que } = await contexto.params;

  const descarga = (cuerpo: string, nombre: string, tipo: string) =>
    new Response(cuerpo, {
      headers: {
        'content-type': `${tipo}; charset=utf-8`,
        'content-disposition': `attachment; filename="${nombre}"`,
        'cache-control': 'no-store',
      },
    });

  switch (que) {
    case 'coleccion':
      return descarga(await exportarColeccionCsv(userId), `scentify-coleccion-${HOY()}.csv`, 'text/csv');
    case 'usos':
      return descarga(await exportarUsosCsv(userId), `scentify-usos-${HOY()}.csv`, 'text/csv');
    case 'copia':
      return descarga(
        JSON.stringify(await copiaCompleta(userId), null, 2),
        `scentify-copia-${HOY()}.json`,
        'application/json',
      );
    default:
      return new Response('No encontrado', { status: 404 });
  }
}
