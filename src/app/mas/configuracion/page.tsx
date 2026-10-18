/** Seccion 7.1 — Ubicacion y umbrales, editables sin desplegar. Y que contextos son atemporales. */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { leerConfiguracion } from '@/servicios/ajustes';
import { accionGuardarConfiguracion, accionGuardarContextosAtemporales } from '@/app/acciones';
import { listarContextos } from '@/servicios/consultas';
import { CamposUbicacion } from './CamposUbicacion';
import { MENSAJE_UMBRALES, type ErrorUmbrales } from '@/dominio/estacion';
import { AvisosDiarios } from '@/componentes/AvisosDiarios';
import { HORA_MAXIMA_RECORDATORIO, leerRecordatorio } from '@/servicios/recordatorio';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Configuración' };

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

export default async function PaginaConfiguracion({
  searchParams,
}: {
  searchParams: Promise<{ guardado?: string; error?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');
  const { guardado, error } = await searchParams;

  const { ubicacion, modoUbicacion, umbrales } = await leerConfiguracion(userId);

  const [recordatorio, contextos] = await Promise.all([
    leerRecordatorio(userId),
    listarContextos(userId),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="titulo">Configuración</h1>
      {error && Object.hasOwn(MENSAJE_UMBRALES, error) ? (
        <p className="aviso-error" role="alert">
          No se han guardado los umbrales. {MENSAJE_UMBRALES[error as ErrorUmbrales]}
        </p>
      ) : guardado ? (
        <p className="aviso-hecho" role="status">
          Configuración guardada.
        </p>
      ) : null}

      <form action={accionGuardarConfiguracion} className="space-y-5">
        <section className="tarjeta space-y-3">
          <h2 className="font-semibold">Ubicación</h2>
          <p className="text-sm text-texto-tenue">
            De aquí sale el tiempo con el que se deduce la estación. No se pide permiso de
            geolocalización al abrir la app: en automática se usa la de tu conexión.
          </p>
          <CamposUbicacion modoInicial={modoUbicacion} ubicacion={ubicacion} />
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
                required
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

      {contextos.length > 0 ? (
        <form action={accionGuardarContextosAtemporales} className="tarjeta space-y-3">
          <h2 className="font-semibold">Contextos atemporales</h2>
          <p className="text-sm text-texto-tenue">
            Donde da igual la hora y la estación: en el gimnasio hace el mismo calor en enero que en
            agosto, de día y de noche. En estos contextos solo cuenta que el perfume esté marcado
            para ellos.
          </p>
          <div className="space-y-2">
            {contextos.map((c) => (
              <label key={c.id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="atemporal"
                  value={c.id}
                  defaultChecked={c.atemporal}
                  className="h-5 w-5"
                />
                {c.nombre}
              </label>
            ))}
          </div>
          <button type="submit" className="boton-secundario w-full">
            Guardar contextos
          </button>
        </form>
      ) : null}

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Aviso de la noche</h2>
        <AvisosDiarios
          clavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
          ajuste={recordatorio}
          horaMaxima={HORA_MAXIMA_RECORDATORIO}
        />
      </section>
    </div>
  );
}
