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
          deep: '#060913',
          surface: '#0a101f',
          card: '#0f172a',
          hover: '#141f38',
          border: 'rgba(255, 255, 255, 0.08)',
          bull: '#10b981',
          bear: '#f43f5e',
          accent: '#38bdf8',
          gold: '#f59e0b'
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
