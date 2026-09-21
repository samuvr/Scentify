/**
 * Tests de integracion contra un PostgreSQL de verdad.
 *
 * Se saltan solos si no hay `DATABASE_URL`, asi que `npm test` sigue siendo
 * instantaneo en una maquina sin base de datos. Para ejecutarlos:
 *
 *   createdb scentify_test
 *   DATABASE_URL=postgresql://…/scentify_test SCENTIFY_DB_DRIVER=tcp npm test
 *
 * Cubren lo que los tests de dominio no pueden ver: que el esquema aguanta las
 * reglas duras y que la importacion y la exportacion cierran el circulo.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
const cuando = hayBaseDeDatos ? describe : describe.skip;

const USUARIO = '00000000-0000-0000-0000-000000000001';

cuando('importación y exportación de la colección (sección 9)', () => {
  let servicios: typeof import('@/servicios/datos');
  let consultas: typeof import('@/servicios/consultas');

  /**
   * Los tests no asumen una base de datos recien creada: cada ejecucion usa su
   * propio prefijo, asi que se pueden lanzar tantas veces como haga falta.
   */
  const marcaDeLaCorrida = `Prueba-${Date.now()}`;

  beforeAll(async () => {
    servicios = await import('@/servicios/datos');
    consultas = await import('@/servicios/consultas');
  });

  /** Un CSV como el del primer día: la colección entera de golpe. */
  function csvDePrueba(cuantos: number): string {
    const cabecera =
      'nombre,marca,concentracion,estado,valoracion,notas_fondo,contextos,estaciones,momentos';
    const filas = Array.from(
      { length: cuantos },
      (_, i) =>
        `Importado ${i + 1},${marcaDeLaCorrida},EDP,LO_TENGO,${(i % 5) + 1},Oud;Ámbar,Oficina;Casa,OTONO;INVIERNO,NOCHE`,
    );
    // Una fila sin nombre y otra con un contexto que no existe.
    filas.push(',Sin nombre,EDP,LO_TENGO,3,,Oficina,OTONO,DIA');
    filas.push(`Contexto raro,${marcaDeLaCorrida},EDP,LO_TENGO,3,,Discoteca,OTONO,DIA`);
    return [cabecera, ...filas].join('\n');
  }

  it('previsualiza antes de tocar nada, señalando errores y contextos desconocidos', async () => {
    const previa = await servicios.previsualizarImportacion(USUARIO, csvDePrueba(40));

    expect(previa.filas).toHaveLength(41); // 40 buenas + la del contexto raro
    expect(previa.errores).toHaveLength(1);
    expect(previa.errores[0]?.motivo).toContain('obligatorios');
    expect(previa.contextosDesconocidos).toEqual(['Discoteca']);
  });

  it('importa 40 perfumes y el CSV exportado los devuelve todos (criterio 11)', async () => {
    const csv = csvDePrueba(40);
    const previa = await servicios.previsualizarImportacion(USUARIO, csv);
    const resultado = await servicios.importarColeccion(USUARIO, previa.filas, {
      omitirDuplicados: true,
    });

    expect(resultado.creados).toBe(41);
    expect(resultado.errores).toEqual([]);

    const exportado = await servicios.exportarColeccionCsv(USUARIO);
    const lineasDeLaCorrida = exportado
      .split('\r\n')
      .filter((l) => l.includes(marcaDeLaCorrida));
    expect(lineasDeLaCorrida).toHaveLength(41);
    expect(exportado).toContain('Importado 40');
    // Las listas se exportan con punto y coma, tal y como se importaron.
    expect(exportado).toContain('OTONO;INVIERNO');
  });

  it('reimportar el mismo fichero no duplica nada', async () => {
    const previa = await servicios.previsualizarImportacion(USUARIO, csvDePrueba(40));
    expect(previa.duplicados).toHaveLength(41);

    const resultado = await servicios.importarColeccion(USUARIO, previa.filas, {
      omitirDuplicados: true,
    });
    expect(resultado.creados).toBe(0);
    expect(resultado.omitidos).toBe(41);
  });

  it('la importación deduplica las notas por nombre normalizado', async () => {
    // Las 41 filas traen "Oud" y "Ámbar"; ambas ya existían en las semillas,
    // así que no debe haberse creado ninguna nota repetida.
    const notas = await consultas.listarNotas();
    const normalizados = notas.map((n) => n.nombreNormalizado);
    expect(new Set(normalizados).size).toBe(normalizados.length);
    expect(normalizados.filter((n) => n === 'oud')).toHaveLength(1);
    expect(normalizados.filter((n) => n === 'ambar')).toHaveLength(1);
  });

  it('la copia JSON incluye todo y declara su versión', async () => {
    const copia = await servicios.copiaCompleta(USUARIO);
    expect(copia.version).toBe(1);
    expect(copia.perfumes.filter((p) => p.marca === marcaDeLaCorrida)).toHaveLength(41);
    expect(copia.contextos).toHaveLength(6);
    expect(copia.ajustes).toHaveLength(8);
  });
});
