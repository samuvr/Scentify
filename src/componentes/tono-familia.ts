/**
 * Un tono por familia olfativa, para dar a cada perfume de la lista una seña
 * visual propia (el filete de color de su familia principal). Es decoración que
 * ayuda a reconocer de un vistazo, no información: el nombre de la familia está
 * en la ficha, y un perfume sin familia simplemente no lleva filete.
 *
 * Tonos apagados a propósito, para convivir con el fondo cálido sin competir
 * con el acento ni con la escala de idoneidad.
 */
const TONO: Record<string, string> = {
  amaderado: '#8b6a47',
  ambar: '#c9954f',
  cuero: '#7a4a33',
  oriental: '#9c4f36',
  resinoso: '#8e5a2e',
  tabaco: '#7d5a3a',
  especiado: '#b3602f',
  'calido-especiado': '#a8522e',
  'fresco-especiado': '#8fa06a',
  gourmand: '#b07a4e',
  dulce: '#c98f7c',
  afrutado: '#c96f58',
  floral: '#b9738f',
  atalcado: '#b7a0b3',
  almizclado: '#a89890',
  citrico: '#cbb655',
  verde: '#6f9a5a',
  aromatico: '#7c9f86',
  fougere: '#6b8a6a',
  chipre: '#6e7d4f',
  fresco: '#79aab4',
  marino: '#4f8fa8',
  mineral: '#8b95a0',
};

export function tonoDeFamilia(slug: string | null | undefined): string | null {
  return slug ? (TONO[slug] ?? null) : null;
}
