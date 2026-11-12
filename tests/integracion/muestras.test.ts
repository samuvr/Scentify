/**
 * Muestras: perfumes probados sin tenerlos (una muestra, un decant, el
 * probador del aeropuerto), contra PostgreSQL. Se salta solo si no hay
 * `DATABASE_URL`.
 *
 * Se guardan con su ficha y sus marcas para registrar el uso, pero no son de
 * la coleccion; y si luego se compran, la muestra pasa a ser el frasco.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
const RONDA = crypto.randomUUID().slice(0, 8);

cuando('muestras', () => {
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  let perfumes: typeof import('@/servicios/perfumes');
  let consultas: typeof import('@/servicios/consultas');
  let usos: typeof import('@/servicios/usos');
  let userId: string;
  let contextoId: string;

  const alta = (
    extra: Partial<import('@/servicios/perfumes').DatosPerfume> = {},
  ): import('@/servicios/perfumes').DatosPerfume => ({
    nombre: `Aventus ${RONDA}`,
    marca: 'Creed',
    concentracion: 'EDP',
    estado: 'MUESTRA',
    fragranticaUrl: `https://www.fragrantica.es/perfume/Creed/Aventus-${RONDA}.html`,
    notas: [
      { nombre: 'Piña', nivel: 'SALIDA' },
      { nombre: 'Abedul', nivel: 'CORAZON' },
      { nombre: 'Almizcle', nivel: 'FONDO' },
    ],
    familiaIds: [],
    contextoIds: [contextoId],
    estaciones: ['PRIMAVERA', 'VERANO'],
    momentos: ['DIA'],
    ...extra,
  });

  let muestra: string;

  beforeAll(async () => {
    db = (await import('@/db')).crearDb();
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    perfumes = await import('@/servicios/perfumes');
    consultas = await import('@/servicios/consultas');
    usos = await import('@/servicios/usos');
    const [u] = await db
      .insert(esquema.usuario)
      .values({ email: `muestras-${RONDA}@ejemplo.com`, passwordHash: '!' })
      .returning({ id: esquema.usuario.id });
    userId = u!.id;
    await db.execute(orm.sql`select sembrar_usuario(${userId}::uuid)`);
    contextoId = (await consultas.listarContextos(userId))[0]!.id;
    muestra = await perfumes.crearPerfume(userId, alta());
  });

  afterAll(async () => {
    if (!userId) return;
    await db.delete(esquema.uso).where(orm.eq(esquema.uso.userId, userId));
    await db.delete(esquema.perfume).where(orm.eq(esquema.perfume.userId, userId));
    await db.delete(esquema.ficha).where(orm.like(esquema.ficha.nombre, `%${RONDA}%`));
    await db.delete(esquema.usuario).where(orm.eq(esquema.usuario.id, userId));
  });

  it('se guarda con su ficha y sus marcas, pero no sale en la colección', async () => {
    const ficha = await consultas.fichaDePerfume(userId, muestra);
    expect(ficha?.perfume.estado).toBe('MUESTRA');
    expect(ficha?.notas.map((n) => n.nombre)).toEqual(['Piña', 'Abedul', 'Almizcle']);
    expect(ficha?.estaciones).toEqual(['PRIMAVERA', 'VERANO']);

    const coleccion = await consultas.listarColeccion(userId);
    expect(coleccion.map((p) => p.id)).not.toContain(muestra);
    const probadas = await consultas.listarColeccion(userId, { estado: 'MUESTRA' });
    expect(probadas.map((p) => p.id)).toEqual([muestra]);
  });

  it('se puede registrar su uso, y se busca desde Hoy marcada como muestra', async () => {
    const resultado = await usos.registrarUso(userId, {
      perfumeId: muestra,
      fecha: '2026-11-10',
      momento: 'DIA',
      contextoId,
      estacionesForzadas: ['VERANO'],
    } as import('@/servicios/usos').DatosUso);
    expect(resultado.idoneidad.pct).toBe(100);

    const paraRegistro = await consultas.coleccionParaRegistro(userId);
    expect(paraRegistro.find((p) => p.id === muestra)?.muestra).toBe(true);
  });

  it('no entra en las sugerencias', async () => {
    const { recomendar } = await import('@/dominio/recomendacion');
    const candidatos = await consultas.candidatosParaRecomendar(userId);
    const { recomendaciones } = recomendar({
      coleccion: candidatos,
      momento: 'DIA',
      contextoId,
      estacionesCompatibles: ['VERANO'],
      contextoAtemporal: false,
      hoy: '2026-11-12',
      descartados: [],
      nombreContexto: 'Oficina',
    });
    expect(recomendaciones.map((r) => r.perfume.id)).not.toContain(muestra);
  });

  it('otra muestra del mismo perfume reutiliza la que hay', async () => {
    expect(await perfumes.crearPerfume(userId, alta())).toBe(muestra);
  });

  it('al comprarlo, la muestra pasa a ser el frasco con su historial', async () => {
    // El catálogo no la da por «ya lo tengo»: el alta es la que la convierte.
    const [enCatalogo] = await consultas.buscarEnCatalogo(userId, `aventus ${RONDA}`);
    expect(enCatalogo?.miPerfumeId).toBeNull();

    const comprado = await perfumes.crearPerfume(
      userId,
      alta({ estado: 'LO_TENGO', volumenMl: 100, fichaId: enCatalogo!.id }),
    );
    expect(comprado).toBe(muestra);
    const ficha = await consultas.fichaDePerfume(userId, comprado);
    expect(ficha?.perfume.estado).toBe('LO_TENGO');
    expect(ficha?.perfume.volumenMl).toBe(100);
    expect(ficha?.historial).toHaveLength(1);
    expect((await consultas.listarColeccion(userId)).map((p) => p.id)).toContain(comprado);
  });
});
