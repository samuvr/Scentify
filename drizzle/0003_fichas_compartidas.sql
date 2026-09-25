-- Fichas compartidas entre cuentas.
--
-- Hasta aqui cada usuario tenia su propia fila de perfume con nombre, marca,
-- piramide y familias, asi que dos personas con el mismo perfume lo daban de
-- alta dos veces. Se separa en dos:
--
--   ficha    lo que describe el perfume, comun a todos: nombre, marca,
--            concentracion, anio, URL de Fragrantica, notas y familias.
--   perfume  el frasco de cada uno: estado, valoracion, volumen, compra,
--            notas personales, archivado, y sus contextos, estaciones y
--            momentos, que son juicio personal y mueven la recomendacion.
--
-- `perfume.id` no cambia, asi que usos, descartes y wishlist siguen apuntando
-- a lo mismo sin tocarlos.
--
-- Migracion de datos: una ficha por cada (nombre y marca normalizados,
-- concentracion) distinta. Si alguien tenia el mismo perfume dos veces, los dos
-- frascos se quedan y comparten ficha; la piramide y las familias salen del
-- frasco mas antiguo. La ficha reutiliza el id de ese frasco, que es lo que
-- permite copiar sus notas sin una tabla de correspondencias.

CREATE TABLE IF NOT EXISTS "ficha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"marca" text NOT NULL,
	"busqueda_normalizada" text NOT NULL,
	"concentracion" "concentracion",
	"anio_lanzamiento" integer,
	"fragrantica_url" text,
	"creada_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ficha_anio" CHECK ("ficha"."anio_lanzamiento" is null or "ficha"."anio_lanzamiento" between 1700 and 2200)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ficha_familia" (
	"ficha_id" uuid NOT NULL,
	"familia_id" uuid NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_ficha_familia" PRIMARY KEY("ficha_id","familia_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ficha_nota" (
	"ficha_id" uuid NOT NULL,
	"nota_id" uuid NOT NULL,
	"nivel" "nivel_piramide" NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_ficha_nota" PRIMARY KEY("ficha_id","nota_id","nivel")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ficha" ADD CONSTRAINT "ficha_creada_por_usuario_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ficha_familia" ADD CONSTRAINT "ficha_familia_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ficha_familia" ADD CONSTRAINT "ficha_familia_familia_id_familia_id_fk" FOREIGN KEY ("familia_id") REFERENCES "public"."familia"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ficha_nota" ADD CONSTRAINT "ficha_nota_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ficha_nota" ADD CONSTRAINT "ficha_nota_nota_id_nota_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."nota"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ficha_clave" ON "ficha" USING btree ("busqueda_normalizada","concentracion") WHERE "ficha"."concentracion" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ficha_clave_sin_concentracion" ON "ficha" USING btree ("busqueda_normalizada") WHERE "ficha"."concentracion" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ficha_busqueda" ON "ficha" USING btree ("busqueda_normalizada");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ficha_familia_familia" ON "ficha_familia" USING btree ("familia_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ficha_nota_nota" ON "ficha_nota" USING btree ("nota_id");
--> statement-breakpoint

/* ------------------------------------------------ datos: perfume -> ficha */

-- Una ficha por clave, tomada del frasco mas antiguo.
INSERT INTO "ficha" ("id", "nombre", "marca", "busqueda_normalizada", "concentracion",
                     "anio_lanzamiento", "fragrantica_url", "creada_por", "creado_en")
SELECT DISTINCT ON (p."busqueda_normalizada", coalesce(p."concentracion"::text, ''))
       p."id", p."nombre", p."marca", p."busqueda_normalizada", p."concentracion",
       p."anio_lanzamiento", p."fragrantica_url", p."user_id", p."creado_en"
FROM "perfume" p
ORDER BY p."busqueda_normalizada", coalesce(p."concentracion"::text, ''), p."creado_en", p."id";
--> statement-breakpoint
-- La ficha reutiliza el id del frasco del que sale: sus notas y familias pasan tal cual.
INSERT INTO "ficha_nota" ("ficha_id", "nota_id", "nivel", "orden")
SELECT pn."perfume_id", pn."nota_id", pn."nivel", pn."orden"
FROM "perfume_nota" pn
JOIN "ficha" f ON f."id" = pn."perfume_id";
--> statement-breakpoint
INSERT INTO "ficha_familia" ("ficha_id", "familia_id", "orden")
SELECT pf."perfume_id", pf."familia_id", pf."orden"
FROM "perfume_familia" pf
JOIN "ficha" f ON f."id" = pf."perfume_id";
--> statement-breakpoint
ALTER TABLE "perfume" ADD COLUMN "ficha_id" uuid;
--> statement-breakpoint
UPDATE "perfume" p SET "ficha_id" = f."id"
FROM "ficha" f
WHERE f."busqueda_normalizada" = p."busqueda_normalizada"
  AND coalesce(f."concentracion"::text, '') = coalesce(p."concentracion"::text, '');
--> statement-breakpoint
ALTER TABLE "perfume" ALTER COLUMN "ficha_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume" ADD CONSTRAINT "perfume_ficha_id_ficha_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."ficha"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_perfume_ficha" ON "perfume" USING btree ("ficha_id");
--> statement-breakpoint

/* --------------------------------------- fuera lo que ya vive en la ficha */

DROP TABLE "perfume_familia" CASCADE;
--> statement-breakpoint
DROP TABLE "perfume_nota" CASCADE;
--> statement-breakpoint
ALTER TABLE "perfume" DROP CONSTRAINT "ck_perfume_anio";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_perfume_busqueda";
--> statement-breakpoint
ALTER TABLE "perfume" DROP COLUMN IF EXISTS "nombre";
--> statement-breakpoint
ALTER TABLE "perfume" DROP COLUMN IF EXISTS "marca";
--> statement-breakpoint
ALTER TABLE "perfume" DROP COLUMN IF EXISTS "busqueda_normalizada";
--> statement-breakpoint
ALTER TABLE "perfume" DROP COLUMN IF EXISTS "concentracion";
--> statement-breakpoint
ALTER TABLE "perfume" DROP COLUMN IF EXISTS "anio_lanzamiento";
--> statement-breakpoint
ALTER TABLE "perfume" DROP COLUMN IF EXISTS "fragrantica_url";
