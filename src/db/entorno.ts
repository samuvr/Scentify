/**
 * Carga `.env` en todo lo que no pasa por Next.
 *
 * `next dev` y `next build` leen `.env` solos, pero `npm run db:migrate`,
 * `npm run db:seed`, `drizzle-kit` y vitest se ejecutan fuera de Next y no lo
 * hacen: sin esto, `DATABASE_URL` sale vacia aunque el fichero exista.
 *
 * Se usa el cargador de Next en vez de dotenv para que las reglas de
 * precedencia (.env.local por encima de .env, etc.) sean identicas a las de la
 * app y no haya dos comportamientos distintos segun quien arranque.
 *
 * Importar este modulo basta; el efecto ocurre al cargarse, asi que tiene que
 * ir en la primera linea de los imports para que el resto ya vea las
 * variables.
 */
import * as nextEnv from '@next/env';

type Cargador = (dir: string, dev?: boolean, log?: unknown) => unknown;

/**
 * `@next/env` es CommonJS y no declara `exports`, asi que cada empaquetador lo
 * expone de una forma distinta: Node en ESM no detecta sus nombres y solo deja
 * `default`, mientras que esbuild —el que usa drizzle-kit para leer
 * `drizzle.config.ts`— los pone al nivel de arriba y deja `default` vacio.
 * Se aceptan las dos formas porque las dos ocurren de verdad en este proyecto.
 */
const modulo = nextEnv as unknown as {
  loadEnvConfig?: Cargador;
  default?: { loadEnvConfig?: Cargador };
};
const loadEnvConfig = modulo.loadEnvConfig ?? modulo.default?.loadEnvConfig;

if (!loadEnvConfig) {
  throw new Error('No se pudo cargar loadEnvConfig de @next/env.');
}

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
  info: () => {},
  error: (...args: unknown[]) => console.error(...args),
});
