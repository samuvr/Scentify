CREATE TABLE IF NOT EXISTS "push_suscripcion" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recordatorio_enviado" (
	"user_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"enviado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_recordatorio_enviado" PRIMARY KEY("user_id","fecha")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wishlist_nota" (
	"wishlist_id" uuid NOT NULL,
	"nota_id" uuid NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_wishlist_nota" PRIMARY KEY("wishlist_id","nota_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_suscripcion" ADD CONSTRAINT "push_suscripcion_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recordatorio_enviado" ADD CONSTRAINT "recordatorio_enviado_user_id_usuario_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_nota" ADD CONSTRAINT "wishlist_nota_wishlist_id_wishlist_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlist"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wishlist_nota" ADD CONSTRAINT "wishlist_nota_nota_id_nota_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."nota"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_push_usuario" ON "push_suscripcion" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wishlist_nota_nota" ON "wishlist_nota" USING btree ("nota_id");