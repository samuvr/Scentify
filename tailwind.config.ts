import type { Config } from 'tailwindcss';

/**
 * Mobile-first de verdad: el estilo base es el de 390 px y `sm:`/`md:` solo
 * ensanchan. No hay ningun breakpoint por debajo de 390.
 */
export default {
  content: ['./src/app/**/*.{ts,tsx}', './src/componentes/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fondo: '#12100e',
        superficie: '#1c1917',
        'superficie-alta': '#292524',
        borde: '#3a3330',
        texto: '#f5f1ec',
        'texto-tenue': '#a8a29e',
        ambar: '#d6a35c',
        'ambar-oscuro': '#8a6a34',
        oud: '#7a4a2b',
        // Escala de idoneidad de la seccion 6.2
        'id-total': '#4ade80',
        'id-alta': '#a3e635',
        'id-parcial': '#fbbf24',
        'id-nula': '#f87171',
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
