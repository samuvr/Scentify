/**
 * Lectura y escritura de la tabla `ajuste` (clave-valor).
 *
 * Los umbrales de la seccion 7.1 se editan desde la pantalla de configuracion,
 * asi que nunca se leen de una constante: siempre de aqui, con los valores por
 * defecto del dominio como red de seguridad si falta alguna clave.
 */
import 'server-only';
import { eq } from 'drizzle-orm';
import { crearDb, schema } from '@/db';
import { UMBRALES_POR_DEFECTO, type UmbralesEstacion } from '@/dominio/estacion';

export interface Ubicacion {
  lat: number;
  lon: number;
  etiqueta: string;
}

export const UBICACION_POR_DEFECTO: Ubicacion = {
  lat: 38.4257,
  lon: -0.4009,
  etiqueta: 'El Campello, Alicante',
};

export interface Configuracion {
  ubicacion: Ubicacion;
  umbrales: UmbralesEstacion;
}

const CLAVES_UMBRAL: Record<keyof UmbralesEstacion, string> = {
  umbralVerano: 'umbral_verano',
  umbralVeranoEntretiempo: 'umbral_verano_entretiempo',
  umbralEntretiempo: 'umbral_entretiempo',
  umbralEntretiempoInvierno: 'umbral_entretiempo_invierno',
  bochornoHumedadPct: 'bochorno_humedad_pct',
  bochornoTemperaturaMin: 'bochorno_temperatura_min',
  bochornoIncremento: 'bochorno_incremento',
};

export async function leerConfiguracion(userId: string): Promise<Configuracion> {
  const db = crearDb();
  const filas = await db
    .select({ clave: schema.ajuste.clave, valor: schema.ajuste.valor })
    .from(schema.ajuste)
    .where(eq(schema.ajuste.userId, userId));

  const mapa = new Map(filas.map((f) => [f.clave, f.valor]));

  const umbrales = { ...UMBRALES_POR_DEFECTO };
  for (const [campo, clave] of Object.entries(CLAVES_UMBRAL) as [
    keyof UmbralesEstacion,
    string,
  ][]) {
    const valor = mapa.get(clave);
    if (typeof valor === 'number' && Number.isFinite(valor)) umbrales[campo] = valor;
  }

  const guardada = mapa.get('ubicacion');
  const ubicacion =
    guardada && typeof guardada === 'object' && 'lat' in guardada
      ? (guardada as Ubicacion)
      : UBICACION_POR_DEFECTO;

  return { ubicacion, umbrales };
}

export async function guardarAjuste(
  userId: string,
  clave: string,
  valor: unknown,
): Promise<void> {
  const db = crearDb();
  await db
    .insert(schema.ajuste)
    .values({ userId, clave, valor })
    .onConflictDoUpdate({
      target: [schema.ajuste.userId, schema.ajuste.clave],
      set: { valor, actualizadoEn: new Date() },
    });
}

export async function guardarUmbrales(
  userId: string,
  umbrales: UmbralesEstacion,
): Promise<void> {
  for (const [campo, clave] of Object.entries(CLAVES_UMBRAL) as [
    keyof UmbralesEstacion,
    string,
  ][]) {
    await guardarAjuste(userId, clave, umbrales[campo]);
  }
}
