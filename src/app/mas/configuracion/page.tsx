/** Seccion 7.1 — Ubicacion y umbrales, editables sin desplegar. */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { leerConfiguracion } from '@/servicios/ajustes';
import { accionGuardarConfiguracion, accionGuardarRecordatorio } from '@/app/acciones';
import { AvisosDiarios } from '@/componentes/AvisosDiarios';
import { RECORDATORIO_POR_DEFECTO, type AjusteRecordatorio } from '@/servicios/recordatorio';

export const dynamic = 'force-dynamic';

const UMBRALES: { clave: string; etiqueta: string; ayuda: string }[] = [
  { clave: 'umbralVerano', etiqueta: 'Solo verano a partir de', ayuda: 'grados' },
  { clave: 'umbralVeranoEntretiempo', etiqueta: 'Verano + entretiempo desde', ayuda: 'grados' },
  { clave: 'umbralEntretiempo', etiqueta: 'Solo entretiempo desde', ayuda: 'grados' },
  { clave: 'umbralEntretiempoInvierno', etiqueta: 'Entretiempo + invierno desde', ayuda: 'grados' },
  { clave: 'bochornoHumedadPct', etiqueta: 'Bochorno: humedad por encima de', ayuda: '%' },
  { clave: 'bochornoTemperaturaMin', etiqueta: 'Bochorno: solo a partir de', ayuda: 'grados' },
  { clave: 'bochornoIncremento', etiqueta: 'Bochorno: suma', ayuda: 'grados' },
];

export default async function PaginaConfiguracion() {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');

  const { ubicacion, umbrales } = await leerConfiguracion(userId);

  const { crearDb, schema } = await import('@/db');
  const { and, eq } = await import('drizzle-orm');
  const [fila] = await crearDb()
    .select({ valor: schema.ajuste.valor })
    .from(schema.ajuste)
    .where(and(eq(schema.ajuste.userId, userId), eq(schema.ajuste.clave, 'recordatorio')))
    .limit(1);
  const recordatorio: AjusteRecordatorio = {
    ...RECORDATORIO_POR_DEFECTO,
    ...((fila?.valor as Partial<AjusteRecordatorio>) ?? {}),
  };

  return (
    <div className="space-y-5">
      <h1 className="titulo">Configuración</h1>

      <form action={accionGuardarConfiguracion} className="space-y-5">
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Ubicación</h2>
          <p className="text-sm text-texto-tenue">
            De aquí sale el tiempo con el que se deduce la estación. No se pide permiso de
            geolocalización al abrir la app.
          </p>
          <div>
            <label htmlFor="etiqueta">Etiqueta</label>
            <input id="etiqueta" name="etiqueta" defaultValue={ubicacion.etiqueta} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lat">Latitud</label>
              <input id="lat" name="lat" type="number" step="0.0001" defaultValue={ubicacion.lat} className="mt-1" />
            </div>
            <div>
              <label htmlFor="lon">Longitud</label>
              <input id="lon" name="lon" type="number" step="0.0001" defaultValue={ubicacion.lon} className="mt-1" />
            </div>
          </div>
        </section>

        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Umbrales de temperatura</h2>
          <p className="text-sm text-texto-tenue">
            Los valores de partida son una propuesta, no una verdad. Muévelos cuando lleves un par
            de meses usando la app.
          </p>
          {UMBRALES.map(({ clave, etiqueta, ayuda }) => (
            <div key={clave}>
              <label htmlFor={clave}>
                {etiqueta} ({ayuda})
              </label>
              <input
                id={clave}
                name={clave}
                type="number"
                step="0.5"
                defaultValue={umbrales[clave as keyof typeof umbrales]}
                className="mt-1"
              />
            </div>
          ))}
        </section>

        <button type="submit" className="boton-primario w-full">
          Guardar configuración
        </button>
      </form>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Recordatorio diario</h2>
        <p className="text-sm text-texto-tenue">
          Si a esta hora no has registrado nada, te llega un aviso.
        </p>

        <form action={accionGuardarRecordatorio} className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={recordatorio.activo}
              className="h-5 w-5"
            />
            Avisarme si no he registrado nada
          </label>
          <div>
            <label htmlFor="hora">Hora del aviso</label>
            <select id="hora" name="hora" defaultValue={String(recordatorio.hora)} className="mt-1">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="boton-secundario w-full">
            Guardar recordatorio
          </button>
        </form>

        <AvisosDiarios clavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
      </section>
    </div>
  );
}
