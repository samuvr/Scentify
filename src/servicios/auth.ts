/**
 * Autenticacion simple (seccion 2): un solo usuario, cookie de sesion firmada.
 *
 * No hay registro ni recuperacion de clave: el usuario se crea con `db:seed`.
 * La cookie lleva el id del usuario y una firma HMAC, asi que no hace falta
 * tabla de sesiones ni una consulta extra en cada peticion.
 */
import 'server-only';
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { crearDb, schema } from '@/db';

const COOKIE = 'scentify_sesion';
const DURACION_DIAS = 90;

function secreto(): string {
  const valor = process.env.AUTH_SECRET;
  if (!valor) throw new Error('Falta AUTH_SECRET.');
  return valor;
}

function firmar(carga: string): string {
  return createHmac('sha256', secreto()).update(carga).digest('base64url');
}

/** Comparacion en tiempo constante, para no filtrar la firma byte a byte. */
function firmaValida(carga: string, firma: string): boolean {
  const esperada = Buffer.from(firmar(carga));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Formato del hash almacenado: scrypt$<sal hex>$<derivada hex>. */
export function hashearPassword(clave: string): string {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString('hex')}$${scryptSync(clave, sal, 64).toString('hex')}`;
}

export function passwordCorrecta(clave: string, hash: string): boolean {
  const [algoritmo, salHex, derivadaHex] = hash.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !derivadaHex) return false;
  const esperada = Buffer.from(derivadaHex, 'hex');
  const recibida = scryptSync(clave, Buffer.from(salHex, 'hex'), esperada.length);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

export async function iniciarSesion(email: string, clave: string): Promise<boolean> {
  const db = crearDb();
  const [usuario] = await db
    .select()
    .from(schema.usuario)
    .where(eq(schema.usuario.email, email.trim().toLowerCase()))
    .limit(1);

  if (!usuario || !passwordCorrecta(clave, usuario.passwordHash)) return false;

  const expira = Date.now() + DURACION_DIAS * 86_400_000;
  const carga = `${usuario.id}.${expira}`;
  const almacen = await cookies();
  almacen.set(COOKIE, `${carga}.${firmar(carga)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DURACION_DIAS * 86_400,
  });
  return true;
}

export async function cerrarSesion(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Id del usuario de la sesion, o null si no hay sesion valida. */
export async function usuarioActual(): Promise<string | null> {
  const valor = (await cookies()).get(COOKIE)?.value;
  if (!valor) return null;

  const corte = valor.lastIndexOf('.');
  if (corte < 0) return null;
  const carga = valor.slice(0, corte);
  const firma = valor.slice(corte + 1);
  if (!firmaValida(carga, firma)) return null;

  const [userId, expira] = carga.split('.');
  if (!userId || !expira || Number(expira) < Date.now()) return null;
  return userId;
}

/** Igual que `usuarioActual` pero lanza. Para paginas y acciones protegidas. */
export async function exigirUsuario(): Promise<string> {
  const userId = await usuarioActual();
  if (!userId) throw new Error('NO_AUTENTICADO');
  return userId;
}
