/** Seccion 7.1 — Ubicacion y umbrales, editables sin desplegar. */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { leerConfiguracion } from '@/servicios/ajustes';
import { accionGuardarConfiguracion } from '@/app/acciones';
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

  const recordatorio = await leerRecordatorio(userId);

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
