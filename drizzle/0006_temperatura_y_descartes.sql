-- Temperatura que decidio la estacion de cada uso (snapshot, para el
-- rendimiento segun el tiempo) y para que contexto y momento se pulso «Otro»
-- (evidencia de la recategorizacion). Todo nullable: los usos y descartes de
-- antes se quedan como estaban.
ALTER TABLE "recomendacion_descarte" ADD COLUMN "contexto_id" uuid;--> statement-breakpoint
ALTER TABLE "recomendacion_descarte" ADD COLUMN "momento" "momento";--> statement-breakpoint
ALTER TABLE "uso" ADD COLUMN "temperatura_usada" real;--> statement-breakpoint
ALTER TABLE "uso" ADD COLUMN "bochorno" boolean;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recomendacion_descarte" ADD CONSTRAINT "recomendacion_descarte_contexto_id_contexto_id_fk" FOREIGN KEY ("contexto_id") REFERENCES "public"."contexto"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
