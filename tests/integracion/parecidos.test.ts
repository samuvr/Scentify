/**
 * «Esta fragancia me recuerda a», guardado en la ficha, contra PostgreSQL. Se
 * salta solo si no hay `DATABASE_URL`.
 *
 * Es lo unico de Fragrantica con votos que se guarda, y la ficha es de todas
 * las cuentas: una lectura que no lo trae no lo borra, y lo que llega de una
 * copia subida a mano se valida antes de entrar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Parecido } from '@/dominio/parecidos';

const cuando = process.env.DATABASE_URL ? describe : describe.skip;
// Las fichas sobreviven a las cuentas: nombres unicos por corrida.
const RONDA = crypto.randomUUID().slice(0, 8);

const CDNIM: Parecido = { marca: 'Armaf', nombre: 'Club de Nuit Intense Man', positivos: 1200, negativos: 87 };
const EROS: Parecido = { marca: 'Versace', nombre: 'Eros', positivos: 640, negativos: 112 };
const HAWAS: Parecido = { marca: 'Rasasi', nombre: 'Hawas for Him', positivos: 95, negativos: 41 };

const leidos = (perfumes: Parecido[]) => ({ leidosEn: new Date().toISOString(), perfumes });

cuando('«Esta fragancia me recuerda a» en la ficha', () => {
  let db: import('@/db').Db;
  let esquema: typeof import('@/db/schema');
  let orm: typeof import('drizzle-orm');
  let perfumes: typeof import('@/servicios/perfumes');
  let consultas: typeof import('@/servicios/consultas');
  let datos: typeof import('@/servicios/datos');
  const cuentas: string[] = [];

  async function cuenta(nombre: string) {
    const [u] = await db
      .insert(esquema.usuario)
      .values({ email: `${nombre}-${RONDA}@ejemplo.com`, passwordHash: '!' })
      .returning({ id: esquema.usuario.id });
    await db.execute(orm.sql`select sembrar_usuario(${u!.id}::uuid)`);
    cuentas.push(u!.id);
    const [contexto] = await consultas.listarContextos(u!.id);
    return { id: u!.id, contexto: contexto!.id };
  }

  const alta = (
    contextoId: string,
    extra: Partial<import('@/servicios/perfumes').DatosPerfume> = {},
  ): import('@/servicios/perfumes').DatosPerfume => ({
    nombre: `Fakhar Black ${RONDA}`,
    marca: 'Lattafa Perfumes',
    concentracion: 'EDP',
    estado: 'LO_TENGO',
    notas: [{ nombre: 'Lavanda', nivel: 'CORAZON' }],
    familiaIds: [],
    contextoIds: [contextoId],
    estaciones: ['PRIMAVERA'],
    momentos: ['DIA'],
    ...extra,
  });

  const fichaDe = async (perfumeId: string) =>
    (await db.select().from(esquema.perfume).where(orm.eq(esquema.perfume.id, perfumeId)))[0]!
      .fichaId;

  const parecidosDe = async (userId: string, perfumeId: string) =>
    (await consultas.fichaDePerfume(userId, perfumeId))?.parecidos ?? null;

  let ana: { id: string; contexto: string };
  let bea: { id: string; contexto: string };
  let deAna: string;
  let deBea: string;

  beforeAll(async () => {
    db = (await import('@/db')).crearDb();
    esquema = await import('@/db/schema');
    orm = await import('drizzle-orm');
    perfumes = await import('@/servicios/perfumes');
    consultas = await import('@/servicios/consultas');
    datos = await import('@/servicios/datos');
    ana = await cuenta('ana');
    bea = await cuenta('bea');
  });

  afterAll(async () => {
    if (cuentas.length === 0) return;
    await db.delete(esquema.uso).where(orm.inArray(esquema.uso.userId, cuentas));
    await db.delete(esquema.perfume).where(orm.inArray(esquema.perfume.userId, cuentas));
    await db.delete(esquema.ficha).where(orm.like(esquema.ficha.nombre, `%${RONDA}%`));
    await db.delete(esquema.usuario).where(orm.inArray(esquema.usuario.id, cuentas));
  });

  it('se guardan en la ficha con su fecha, y la ficha los enseña', async () => {
    const antes = Date.now();
    deAna = await perfumes.crearPerfume(
      ana.id,
      alta(ana.contexto, { parecidos: leidos([CDNIM, EROS, HAWAS]) }),
    );

    const parecidos = await parecidosDe(ana.id, deAna);
    expect(parecidos?.perfumes).toEqual([CDNIM, EROS, HAWAS]);
    expect(Date.parse(parecidos!.leidosEn)).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('editar sin una lectura nueva no los borra', async () => {
    await perfumes.actualizarPerfume(ana.id, deAna, alta(ana.contexto, { valoracion: 4 }));
    expect((await parecidosDe(ana.id, deAna))?.perfumes).toEqual([CDNIM, EROS, HAWAS]);
  });

  it('quien tiene el mismo perfume los ve, y una lectura nueva los cambia para todos', async () => {
    deBea = await perfumes.crearPerfume(bea.id, alta(bea.contexto, { fichaId: await fichaDe(deAna) }));
    expect(await fichaDe(deBea)).toBe(await fichaDe(deAna));
    expect((await parecidosDe(bea.id, deBea))?.perfumes).toEqual([CDNIM, EROS, HAWAS]);

    // Bea vuelve a consultar Fragrantica y los votos se han movido.
    const movidos = [EROS, { ...CDNIM, positivos: 1300 }, HAWAS];
    await perfumes.actualizarPerfume(bea.id, deBea, alta(bea.contexto, { parecidos: leidos(movidos) }));
    expect((await parecidosDe(ana.id, deAna))?.perfumes).toEqual(movidos);
  });

  it('un alta a mano de algo que ya existe no pisa los que había', async () => {
    const carla = await cuenta('carla');
    const suyo = await perfumes.crearPerfume(
      carla.id,
      alta(carla.contexto, { parecidos: leidos([HAWAS]) }),
    );
    expect(await fichaDe(suyo)).toBe(await fichaDe(deAna));
    expect((await parecidosDe(ana.id, deAna))?.perfumes).toHaveLength(3);
  });

  it('pero si a la ficha le faltan, el alta a mano los rellena', async () => {
    const dani = await cuenta('dani');
    const sinParecidos = await perfumes.crearPerfume(
      dani.id,
      alta(dani.contexto, { nombre: `Fakhar Rose ${RONDA}` }),
    );
    expect(await parecidosDe(dani.id, sinParecidos)).toBeNull();

    const elena = await cuenta('elena');
    await perfumes.crearPerfume(
      elena.id,
      alta(elena.contexto, { nombre: `Fakhar Rose ${RONDA}`, parecidos: leidos([EROS]) }),
    );
    expect((await parecidosDe(dani.id, sinParecidos))?.perfumes).toEqual([EROS]);
  });

  it('la copia los lleva, y al restaurar se queda fuera lo mal formado', async () => {
    const fede = await cuenta('fede');
    await perfumes.crearPerfume(
      fede.id,
      alta(fede.contexto, { nombre: `Fakhar Gold ${RONDA}`, parecidos: leidos([HAWAS, EROS]) }),
    );
    await perfumes.crearPerfume(fede.id, alta(fede.contexto, { nombre: `Fakhar Silver ${RONDA}` }));

    // Lo que hace la pantalla: descargar el fichero y volver a subirlo.
    const copia = JSON.parse(JSON.stringify(await datos.copiaCompleta(fede.id)));
    const gold = copia.fichas.find((f: { nombre: string }) => f.nombre.startsWith('Fakhar Gold'));
    const silver = copia.fichas.find((f: { nombre: string }) => f.nombre.startsWith('Fakhar Silver'));
    expect(gold.parecidos.perfumes).toEqual([HAWAS, EROS]);

    // Se renombran para que la restauracion cree fichas nuevas en vez de
    // engancharse a las que ya existen, y una trae parecidos manipulados.
    gold.nombre = `Fakhar Gold Restaurado ${RONDA}`;
    silver.nombre = `Fakhar Silver Restaurado ${RONDA}`;
    silver.parecidos = { leidosEn: 'ayer', perfumes: [{ nombre: 'Eros', positivos: 'muchos' }] };
    await datos.restaurarCopia(fede.id, copia);

    const fichas = await db
      .select({ nombre: esquema.ficha.nombre, parecidos: esquema.ficha.parecidos })
      .from(esquema.ficha)
      .where(orm.like(esquema.ficha.nombre, `% Restaurado ${RONDA}`));
    const porNombre = new Map(fichas.map((f) => [f.nombre, f.parecidos]));
    expect(porNombre.get(`Fakhar Gold Restaurado ${RONDA}`)?.perfumes).toEqual([HAWAS, EROS]);
    expect(porNombre.get(`Fakhar Silver Restaurado ${RONDA}`)).toBeNull();
  });
});
