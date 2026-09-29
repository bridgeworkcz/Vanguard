/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#020617",
          card: "#0f172a",
          gold: "#f59e0b",
          emerald: "#10b981",
        }
      }
    },
  },
  plugins: [],
};
