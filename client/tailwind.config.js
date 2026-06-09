/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Tipografia "pixel/retrô" opcional para reforçar a estética de RPG.
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      colors: {
        night: '#1a1b26',
        panel: '#24283b',
        accent: '#7aa2f7',
      },
    },
  },
  plugins: [],
};
