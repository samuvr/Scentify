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
       * Oscuro calido con un solo acento ambar: la paleta de lo que hay en la
       * coleccion (oud, ambar, cuero), no la de una terminal. Contraste de cada
       * tono de texto comprobado contra `superficie-alta`, que es el fondo mas
       * claro sobre el que se escribe: el mas bajo, `id-nula`, da 5.6:1, por
       * encima del AA de 4.5.
       */
      colors: {
        fondo: '#14110e',
        superficie: '#1c1814',
        'superficie-alta': '#29231d',
        borde: '#3d342b',
        texto: '#f3ece3',
        'texto-tenue': '#a89b8c',
        /**
         * El acento marca la accion principal y lo que esta seleccionado, y en
         * los graficos, el dato que destaca. Fuera de eso, sobra.
         */
        acento: '#d6a45e',
        'acento-tenue': '#e6bb7c',
        /**
         * Escala de idoneidad de la seccion 6.2, con los tonos que pide la
         * spec: verde, verde claro, ambar y rojo. Es el unico sitio de la app
         * donde el color lleva informacion, y va siempre con su etiqueta en
         * texto para que no dependa solo del tono.
         */
        'id-total': '#86c77f',
        'id-alta': '#c2d17a',
        'id-parcial': '#e89a4f',
        'id-nula': '#ec7a66',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Solo para nombres de perfume y titulos: el caracter de la app.
        display: ['var(--fuente-display)', 'Georgia', 'serif'],
      },
      spacing: {
        // Altura minima de area tactil comoda con el pulgar.
        tactil: '3rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
