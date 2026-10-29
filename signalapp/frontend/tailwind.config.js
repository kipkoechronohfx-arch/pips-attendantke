/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fintech: {
          deep: '#050505',
          surface: 'rgba(255, 255, 255, 0.03)',
          card: 'rgba(10, 10, 14, 0.50)',
          hover: 'rgba(255, 255, 255, 0.06)',
          border: 'rgba(255, 255, 255, 0.08)',
          bull: '#10b981',
          bear: '#f43f5e',
          accent: '#38bdf8',
          gold: '#d4af37'
        }
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    },
  },
  plugins: [],
}
