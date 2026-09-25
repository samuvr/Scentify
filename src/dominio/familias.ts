/**
 * De los acordes principales de Fragrantica a las familias de Scentify.
 *
 * Fragrantica los escribe a su manera: en plural a veces («florales»,
 * «afrutados»), en ingles en la ficha inglesa («woody», «fresh spicy») y con
 * nombres que aqui llevan barra («marino» es «Marino / Acuático»). Se busca la
 * coincidencia exacta tras normalizar, nunca por contener: «cálido especiado»
 * tiene su propia familia y no debe marcar ademas «Especiado».
 *
 * Los acordes llegan ordenados por fuerza, y las familias salen en ese mismo
 * orden, que es el de relevancia que guarda `ficha_familia.orden`.
 */
import { normalizar } from './texto';

export interface FamiliaConocida {
  id: string;
  slug: string;
  nombre: string;
}

/**
 * Acordes que no se escriben como ninguna familia pero son una de ellas, por
 * slug. Sobre todo la ficha inglesa.
 */
const ALIAS: Record<string, string> = {
  woody: 'amaderado',
  amber: 'ambar',
  leather: 'cuero',
  marine: 'marino',
  aquatic: 'marino',
  aromatic: 'aromatico',
  spicy: 'especiado',
  'especiado suave': 'especiado',
  'soft spicy': 'especiado',
  citrus: 'citrico',
  floral: 'floral',
  'white floral': 'floral',
  'floral blanco': 'floral',
  musky: 'almizclado',
  powdery: 'atalcado',
  fruity: 'afrutado',
  green: 'verde',
  balsamic: 'resinoso',
  balsamico: 'resinoso',
  smoky: 'resinoso',
  tobacco: 'tabaco',
  sweet: 'dulce',
  ozonic: 'mineral',
  fresh: 'fresco',
  'fresh spicy': 'fresco-especiado',
  'warm spicy': 'calido-especiado',
};

/** Variantes de un texto ya normalizado: tal cual y cada palabra en singular. */
function variantes(texto: string): string[] {
  const singular = texto
    .split(' ')
    .map((palabra) =>
      // «florales» → «floral», «afrutados» → «afrutado».
      palabra.endsWith('les') || palabra.endsWith('res')
        ? palabra.slice(0, -2)
        : palabra.endsWith('s') && palabra.length > 3
          ? palabra.slice(0, -1)
          : palabra,
    )
    .join(' ');
  return singular === texto ? [texto] : [texto, singular];
}

export function familiasDeAcordes(acordes: string[], familias: FamiliaConocida[]): string[] {
  const porClave = new Map<string, string>();
  const porSlug = new Map(familias.map((f) => [f.slug, f.id]));
  for (const f of familias) {
    porClave.set(normalizar(f.slug.replace(/-/g, ' ')), f.id);
    // «Marino / Acuático» vale como «marino» y como «acuático».
    for (const parte of f.nombre.split('/')) porClave.set(normalizar(parte), f.id);
  }

  const ids: string[] = [];
  for (const acorde of acordes) {
    const clave = normalizar(acorde);
    const id =
      variantes(clave)
        .map((v) => porClave.get(v) ?? porSlug.get(ALIAS[v] ?? ''))
        .find(Boolean) ?? null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
