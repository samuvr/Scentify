import type { Config } from 'tailwindcss';

/**
 * Mobile-first de verdad: el estilo base es el de 390 px y `sm:`/`md:` solo
 * ensanchan. No hay ningun breakpoint por debajo de 390.
 */
export default {
  content: ['./src/app/**/*.{ts,tsx}', './src/componentes/**/*.{ts,tsx}'],
  theme: {
    /**
     * Sin esquinas redondeadas en ninguna parte. Se anula la escala completa
     * de Tailwind en vez de limitarse a no usarla, para que la decision sea
     * estructural: cualquier `rounded-*` que alguien escriba mas adelante
     * seguira dando canto vivo y no habra que vigilarlo en cada revision.
     */
    borderRadius: {
      none: '0',
      sm: '0',
      DEFAULT: '0',
      md: '0',
      lg: '0',
      xl: '0',
      '2xl': '0',
      '3xl': '0',
      full: '0',
    },
    extend: {
      /**
       * Monocromo: negro, blanco y grises. El contraste de cada tono de texto
       * esta comprobado contra el fondo y contra las tarjetas; el escalon mas
       * bajo de la rampa (`id-nula`) es 4.9:1 sobre superficie, por encima del
       * minimo AA de 4.5 para texto normal.
       */
      colors: {
        fondo: '#000000',
        superficie: '#0d0d0d',
        'superficie-alta': '#1a1a1a',
        borde: '#2b2b2b',
        texto: '#f5f5f5',
        'texto-tenue': '#9a9a9a',
        // Antes era ambar. El acento es el blanco puro: destaca por contraste,
        // no por tono, que es lo unico que queda en una paleta sin color.
        acento: '#ffffff',
        'acento-tenue': '#b5b5b5',
        /**
         * Escala de idoneidad de la seccion 6.2. Es un orden, no cuatro
         * categorias sueltas, asi que en monocromo se codifica como rampa de
         * claridad: cuanto mas idoneo, mas claro. Va siempre acompanada de su
         * etiqueta en texto ("Total", "Alta", "Parcial", "Nula"), que es lo
         * que de verdad comunica el valor.
         */
        'id-total': '#ffffff',
        'id-alta': '#c8c8c8',
        'id-parcial': '#9a9a9a',
        'id-nula': '#808080',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      spacing: {
        // Altura minima de area tactil comoda con el pulgar.
        tactil: '3rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
