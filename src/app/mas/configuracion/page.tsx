/**
 * Seccion 7.1 — Ubicacion y umbrales, editables sin desplegar. Y los
 * contextos: cuales son atemporales, en que momentos existen y cuanto se usan,
 * con la frecuencia real de los ultimos 90 dias al lado.
 */
import { redirect } from 'next/navigation';
import { usuarioActual } from '@/servicios/auth';
import { leerConfiguracion } from '@/servicios/ajustes';
import { accionGuardarConfiguracion, accionGuardarContextos } from '@/app/acciones';
import { frecuenciaRealDeContextos, listarContextos } from '@/servicios/consultas';
import { hoyIso } from '@/servicios/usos';
import { zonaDelUsuario } from '@/servicios/zona';
import { formatearFrecuencia, MAXIMO_USOS_SEMANA } from '@/dominio/contextos';
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
  searchParams: Promise<{ guardado?: string; error?: string; errorContextos?: string }>;
}) {
  const userId = await usuarioActual();
  if (!userId) redirect('/login');
  const { guardado, error, errorContextos } = await searchParams;

  const { ubicacion, modoUbicacion, umbrales } = await leerConfiguracion(userId);

  const hoy = hoyIso(await zonaDelUsuario());
  const [recordatorio, contextos, real] = await Promise.all([
    leerRecordatorio(userId),
    listarContextos(userId),
    frecuenciaRealDeContextos(userId, hoy),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="titulo">Configuración</h1>
      {errorContextos ? (
        <p className="aviso-error" role="alert">
          No se han guardado los contextos. {errorContextos}
        </p>
      ) : error && Object.hasOwn(MENSAJE_UMBRALES, error) ? (
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
        <form id="contextos" action={accionGuardarContextos} className="tarjeta space-y-4">
          <div className="space-y-1">
            <h2 className="font-semibold">Contextos</h2>
            <p className="text-sm text-texto-tenue">
              Cuántas veces a la semana usas cada uno y qué parte es de noche: es lo que pesa cada
              contexto en el reparto. Al lado, lo real de tus registros de los últimos 90 días, para
              que veas si te desvías.
            </p>
            <p className="text-sm text-texto-tenue">
              Si un contexto solo existe de día o de noche (a la oficina se va de día), desmarca el
              otro momento y esa combinación desaparece del registro, la recomendación, los huecos,
              el reparto, el viaje y los filtros. Los atemporales, como el gimnasio, valen a
              cualquier hora y estación: ahí solo cuenta que el perfume esté marcado para ellos.
            </p>
          </div>
          {contextos.map((c) => {
            const deVerdad = real.get(c.id);
            return (
              <fieldset key={c.id} className="space-y-3 border-t border-borde pt-3">
                <legend className="sr-only">{c.nombre}</legend>
                <input type="hidden" name="contexto" value={c.id} />
                <input type="hidden" name={`nombre-${c.id}`} value={c.nombre} />
                <p className="font-medium" aria-hidden="true">
                  {c.nombre}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {(['DIA', 'NOCHE'] as const).map((m) => (
                    <label key={m} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name={`momentos-${c.id}`}
                        value={m}
                        defaultChecked={c.momentos.includes(m)}
                        className="h-5 w-5"
                      />
                      {m === 'DIA' ? 'De día' : 'De noche'}
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="atemporal"
                      value={c.id}
                      defaultChecked={c.atemporal}
                      className="h-5 w-5"
                    />
                    Atemporal
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`usos-${c.id}`}>Veces por semana</label>
                    <input
                      id={`usos-${c.id}`}
                      name={`usos-${c.id}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAXIMO_USOS_SEMANA}
                      step="0.1"
                      placeholder="Sin decir"
                      defaultValue={c.usosSemana ?? ''}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-texto-tenue">
                      Real: {formatearFrecuencia(deVerdad?.usosSemana ?? 0)}
                    </p>
                  </div>
                  <div>
                    <label htmlFor={`noche-${c.id}`}>% de noche</label>
                    <input
                      id={`noche-${c.id}`}
                      name={`noche-${c.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      step="5"
                      required
                      defaultValue={c.pctNoche}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-texto-tenue">
                      {c.atemporal || c.momentos.length < 2
                        ? 'No cuenta: no tiene día y noche.'
                        : `Real: ${deVerdad?.pctNoche != null ? `${deVerdad.pctNoche} %` : '—'}`}
                    </p>
                  </div>
                </div>
              </fieldset>
            );
          })}
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
