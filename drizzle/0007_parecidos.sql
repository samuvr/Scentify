-- «Esta fragancia me recuerda a»: los tres primeros perfumes del bloque de
-- Fragrantica, con sus votos y la fecha de lectura. Nullable: las fichas de
-- antes se quedan sin el hasta que se vuelva a consultar.
ALTER TABLE "ficha" ADD COLUMN "parecidos" jsonb;
