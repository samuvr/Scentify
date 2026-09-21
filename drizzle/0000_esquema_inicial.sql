CREATE TYPE "public"."concentracion" AS ENUM('EDC', 'EDT', 'EDP', 'EXTRAIT', 'PARFUM', 'ACEITE', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."duracion_percibida" AS ENUM('MENOS_2H', 'DE_2_4H', 'DE_4_6H', 'DE_6_8H', 'MAS_8H');--> statement-breakpoint
CREATE TYPE "public"."estacion" AS ENUM('PRIMAVERA', 'VERANO', 'OTONO', 'INVIERNO');--> statement-breakpoint
CREATE TYPE "public"."estado_perfume" AS ENUM('LO_TENGO', 'LO_TUVE');--> statement-breakpoint
CREATE TYPE "public"."momento" AS ENUM('DIA', 'NOCHE');--> statement-breakpoint
CREATE TYPE "public"."nivel_piramide" AS ENUM('SALIDA', 'CORAZON', 'FONDO');--> statement-breakpoint
CREATE TYPE "public"."origen_estacion" AS ENUM('TEMPERATURA', 'CALENDARIO', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."prioridad_wishlist" AS ENUM('EN_EL_RADAR', 'LO_QUIERO', 'LO_NECESITO');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ajuste" (
	"user_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"valor" jsonb NOT NULL,
	"descripcion" text,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_ajuste" PRIMARY KEY("user_id","clave")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clima_diario" (
	"lat" numeric(8, 5) NOT NULL,
	"lon" numeric(8, 5) NOT NULL,
	"fecha" date NOT NULL,
	"temperatura_max" numeric(4, 1) NOT NULL,
	"temperatura_min" numeric(4, 1) NOT NULL,
	"humedad_media" numeric(5, 2),
	"obtenido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_clima_diario" PRIMARY KEY("lat","lon","fecha")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contexto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_contexto_usuario_slug" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "familia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "familia_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nota" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"nombre_normalizado" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nota_nombre_normalizado_unique" UNIQUE("nombre_normalizado")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfume" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"marca" text NOT NULL,
	"busqueda_normalizada" text NOT NULL,
	"concentracion" "concentracion",
	"anio_lanzamiento" integer,
	"volumen_ml" integer,
	"fecha_compra" date,
	"estado" "estado_perfume" DEFAULT 'LO_TENGO' NOT NULL,
	"valoracion" smallint,
	"notas_personales" text,
	"fragrantica_url" text,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_perfume_valoracion" CHECK ("perfume"."valoracion" is null or "perfume"."valoracion" between 1 and 5),
	CONSTRAINT "ck_perfume_anio" CHECK ("perfume"."anio_lanzamiento" is null or "perfume"."anio_lanzamiento" between 1700 and 2200),
	CONSTRAINT "ck_perfume_volumen" CHECK ("perfume"."volumen_ml" is null or "perfume"."volumen_ml" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfume_contexto" (
	"perfume_id" uuid NOT NULL,
	"contexto_id" uuid NOT NULL,
	CONSTRAINT "pk_perfume_contexto" PRIMARY KEY("perfume_id","contexto_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfume_estacion" (
	"perfume_id" uuid NOT NULL,
	"estacion" "estacion" NOT NULL,
	CONSTRAINT "pk_perfume_estacion" PRIMARY KEY("perfume_id","estacion")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfume_familia" (
	"perfume_id" uuid NOT NULL,
	"familia_id" uuid NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_perfume_familia" PRIMARY KEY("perfume_id","familia_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfume_momento" (
	"perfume_id" uuid NOT NULL,
	"momento" "momento" NOT NULL,
	CONSTRAINT "pk_perfume_momento" PRIMARY KEY("perfume_id","momento")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfume_nota" (
	"perfume_id" uuid NOT NULL,
	"nota_id" uuid NOT NULL,
	"nivel" "nivel_piramide" NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_perfume_nota" PRIMARY KEY("perfume_id","nota_id","nivel")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recomendacion_descarte" (
	"user_id" uuid NOT NULL,
	"perfume_id" uuid NOT NULL,
	"fecha" date DEFAULT current_date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_recomendacion_descarte" PRIMARY KEY("user_id","perfume_id","fecha")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "uso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"perfume_id" uuid NOT NULL,
	"fecha" date DEFAULT current_date NOT NULL,
	"momento" "momento" NOT NULL,
	"contexto_id" uuid NOT NULL,
	"sprays" smallint,
	"duracion_percibida" "duracion_percibida",
	"valoracion_dia" smallint,
	"idoneidad_pct" smallint NOT NULL,
	"idoneidad_detalle" jsonb NOT NULL,
	"estacion_efectiva" "estacion" NOT NULL,
	"estaciones_efectivas" "estacion"[] NOT NULL,
	"origen_estacion" "origen_estacion" DEFAULT 'TEMPERATURA' NOT NULL,
	"comentario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_uso_idoneidad" CHECK ("uso"."idoneidad_pct" in (0, 33, 67, 100)),
	CONSTRAINT "ck_uso_valoracion_dia" CHECK ("uso"."valoracion_dia" is null or "uso"."valoracion_dia" between 1 and 5),
	CONSTRAINT "ck_uso_sprays" CHECK ("uso"."sprays" is null or "uso"."sprays" between 0 and 100),
	CONSTRAINT "ck_uso_estaciones_efectivas" CHECK (cardinality("uso"."estaciones_efectivas") between 1 and 2),
	CONSTRAINT "ck_uso_estacion_dominante" CHECK ("uso"."estacion_efectiva" = any("uso"."estaciones_efectivas"))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wishlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"marca" text NOT NULL,
	"prioridad" "prioridad_wishlist" DEFAULT 'EN_EL_RADAR' NOT NULL,
	"precio_objetivo" numeric(10, 2),
	"notas" text,
	"fragrantica_url" text,
	"convertido_a_perfume_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_wishlist_precio" CHECK ("wishlist"."precio_objetivo" is null or "wishlist"."precio_objetivo" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ajuste" ADD CONSTRAINT "ajuste_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contexto" ADD CONSTRAINT "contexto_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume" ADD CONSTRAINT "perfume_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_contexto" ADD CONSTRAINT "perfume_contexto_perfume_id_perfume_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfume"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_contexto" ADD CONSTRAINT "perfume_contexto_contexto_id_contexto_id_fk" FOREIGN KEY ("contexto_id") REFERENCES "public"."contexto"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_estacion" ADD CONSTRAINT "perfume_estacion_perfume_id_perfume_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfume"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_familia" ADD CONSTRAINT "perfume_familia_perfume_id_perfume_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfume"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_familia" ADD CONSTRAINT "perfume_familia_familia_id_familia_id_fk" FOREIGN KEY ("familia_id") REFERENCES "public"."familia"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_momento" ADD CONSTRAINT "perfume_momento_perfume_id_perfume_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfume"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_nota" ADD CONSTRAINT "perfume_nota_perfume_id_perfume_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfume"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfume_nota" ADD CONSTRAINT "perfume_nota_nota_id_nota_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."nota"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recomendacion_descarte" ADD CONSTRAINT "recomendacion_descarte_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recomendacion_descarte" ADD CONSTRAINT "recomendacion_descarte_perfume_id_perfume_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfume"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uso" ADD CONSTRAINT "uso_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uso" ADD CONSTRAINT "uso_perfume_id_perfume_id_fk" FOREIGN KEY ("perfume_id") REFERENCES "public"."perfume"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uso" ADD CONSTRAINT "uso_contexto_id_contexto_id_fk" FOREIGN KEY ("contexto_id") REFERENCES "public"."contexto"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_convertido_a_perfume_id_perfume_id_fk" FOREIGN KEY ("convertido_a_perfume_id") REFERENCES "public"."perfume"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nota_normalizado" ON "nota" USING btree ("nombre_normalizado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_perfume_usuario_estado" ON "perfume" USING btree ("user_id","estado","archivado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_perfume_busqueda" ON "perfume" USING btree ("user_id","busqueda_normalizada");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_perfume_contexto_contexto" ON "perfume_contexto" USING btree ("contexto_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_perfume_familia_familia" ON "perfume_familia" USING btree ("familia_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_perfume_nota_nota" ON "perfume_nota" USING btree ("nota_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uso_usuario_fecha" ON "uso" USING btree ("user_id","fecha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uso_perfume_fecha" ON "uso" USING btree ("perfume_id","fecha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_uso_contexto" ON "uso" USING btree ("contexto_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wishlist_usuario_prioridad" ON "wishlist" USING btree ("user_id","prioridad");