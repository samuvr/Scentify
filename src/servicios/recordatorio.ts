/**
 * Seccion 10.4 — Recordatorio diario.
 *
 * Si a cierta hora no hay ningun registro del dia, llega un aviso al movil.
 * Va por Web Push con VAPID, que no necesita ningun servicio de terceros ni
 * cuenta de pago: el navegador da un endpoint y el servidor le escribe.
 *
 * La tarea programada puede dispararse mas de una vez (o reintentarse), asi que
 * el envio queda anotado en `recordatorio_enviado` y el segundo intento del
 * mismo dia no hace nada.
 */
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { crearDb, schema } from '@/db';

export interface AjusteRecordatorio {
  activo: boolean;
  /** Hora local, 0-23. */
  hora: number;
}

export const RECORDATORIO_POR_DEFECTO: AjusteRecordatorio = { activo: false, hora: 21 };

export const ZONA_POR_DEFECTO = 'Europe/Madrid';

/** Hora local actual en una zona, 0-23. */
export function horaLocal(zona = ZONA_POR_DEFECTO, ahora = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', hour12: false }).format(
      ahora,
    ),
  );
}

export function fechaLocal(zona = ZONA_POR_DEFECTO, ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(ahora);
}

function configurarVapid(): boolean {
  const publica = process.env.VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const contacto = process.env.VAPID_SUBJECT ?? 'mailto:scentify@localhost';
  if (!publica || !privada) return false;
  webpush.setVapidDetails(contacto, publica, privada);
  return true;
}

export async function guardarSuscripcion(
  userId: string,
  suscripcion: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const db = crearDb();
  await db
    .insert(schema.pushSuscripcion)
    .values({
      endpoint: suscripcion.endpoint,
      userId,
      p256dh: suscripcion.keys.p256dh,
      auth: suscripcion.keys.auth,
    })
    .onConflictDoUpdate({
      target: schema.pushSuscripcion.endpoint,
      set: { userId, p256dh: suscripcion.keys.p256dh, auth: suscripcion.keys.auth },
    });
}

export async function borrarSuscripcion(endpoint: string): Promise<void> {
  const db = crearDb();
  await db.delete(schema.pushSuscripcion).where(eq(schema.pushSuscripcion.endpoint, endpoint));
}

export interface ResultadoRecordatorios {
  revisados: number;
  enviados: number;
  omitidos: string[];
}

/**
 * Recorre los usuarios con recordatorio activo y avisa a los que no tienen
 * ningun registro hoy y ya han pasado su hora.
 */
export async function enviarRecordatoriosPendientes(
  ahora = new Date(),
): Promise<ResultadoRecordatorios> {
  const resultado: ResultadoRecordatorios = { revisados: 0, enviados: 0, omitidos: [] };
  if (!configurarVapid()) {
    resultado.omitidos.push('Sin claves VAPID configuradas.');
    return resultado;
  }

  const db = crearDb();
  const configuraciones = await db
    .select({ userId: schema.ajuste.userId, valor: schema.ajuste.valor })
    .from(schema.ajuste)
    .where(eq(schema.ajuste.clave, 'recordatorio'));

  for (const { userId, valor } of configuraciones) {
    const ajuste = valor as Partial<AjusteRecordatorio> | null;
    if (!ajuste?.activo) continue;
    resultado.revisados += 1;

    const hora = typeof ajuste.hora === 'number' ? ajuste.hora : RECORDATORIO_POR_DEFECTO.hora;
    if (horaLocal(ZONA_POR_DEFECTO, ahora) < hora) continue;

    const hoy = fechaLocal(ZONA_POR_DEFECTO, ahora);

    const [yaRegistrado] = await db
      .select({ id: schema.uso.id })
      .from(schema.uso)
      .where(and(eq(schema.uso.userId, userId), eq(schema.uso.fecha, hoy)))
      .limit(1);
    if (yaRegistrado) continue;

    // Anotar antes de enviar: si el envio falla a medias, no se repite el aviso
    // a las suscripciones que si lo recibieron.
    const anotado = await db
      .insert(schema.recordatorioEnviado)
      .values({ userId, fecha: hoy })
      .onConflictDoNothing()
      .returning({ fecha: schema.recordatorioEnviado.fecha });
    if (anotado.length === 0) continue;

    const suscripciones = await db
      .select()
      .from(schema.pushSuscripcion)
      .where(eq(schema.pushSuscripcion.userId, userId));

    for (const s of suscripciones) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            titulo: '¿Qué te has puesto hoy?',
            cuerpo: 'Todavía no has registrado ningún perfume.',
            url: '/',
          }),
        );
        resultado.enviados += 1;
      } catch (error) {
        // 404 y 410 significan que la suscripcion ya no vale: se limpia.
        const estado = (error as { statusCode?: number }).statusCode;
        if (estado === 404 || estado === 410) await borrarSuscripcion(s.endpoint);
        else resultado.omitidos.push(`${s.endpoint.slice(0, 40)}…: ${String(error)}`);
      }
    }
  }

  return resultado;
}

/** Limpia los registros de envio viejos, que solo sirven para el dia en curso. */
export async function limpiarRecordatoriosViejos(): Promise<void> {
  const db = crearDb();
  await db
    .delete(schema.recordatorioEnviado)
    .where(sql`${schema.recordatorioEnviado.fecha} < current_date - 7`);
}
