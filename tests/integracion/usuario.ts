/**
 * El usuario contra el que corren los tests de integracion.
 *
 * Se busca en la tabla en vez de fijar un UUID: la semilla solo usa
 * `SCENTIFY_USER_ID` si se le pasa, y si no genera uno aleatorio. Fijarlo aqui
 * hacia que los tests fallaran contra cualquier base sembrada sin esa variable,
 * con errores que no apuntaban a la causa.
 */
import { crearDb, schema } from '@/db';

export async function usuarioDePruebas(): Promise<string> {
  const [usuario] = await crearDb()
    .select({ id: schema.usuario.id })
    .from(schema.usuario)
    .orderBy(schema.usuario.creadoEn)
    .limit(1);

  if (!usuario) {
    throw new Error(
      'No hay ningún usuario en la base de datos. Ejecuta `npm run db:seed` antes de los tests.',
    );
  }
  return usuario.id;
}
