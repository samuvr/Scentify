-- Familias que Fragrantica usa como acordes principales y faltaban en las
-- semillas de 0001. «Fresco especiado» y «Cálido especiado» son familias
-- propias, no variantes de «Especiado»: Fragrantica las distingue y un perfume
-- puede tener una sin la otra.
--
-- Idempotente, como las semillas: reaplicarla no duplica nada.

INSERT INTO "familia" ("slug", "nombre") VALUES
  ('fresco',           'Fresco'),
  ('fresco-especiado', 'Fresco especiado'),
  ('calido-especiado', 'Cálido especiado')
ON CONFLICT ("slug") DO NOTHING;
