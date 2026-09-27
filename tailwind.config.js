/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{svelte,ts,js}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "sans-serif"],
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        mono: ["SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", "monospace"]
      },
      colors: {
        docs: "#1a73e8",
        sheets: "#0f9d58",
        slides: "#f4b400",
        forms: "#7248b9",
        keep: "#fbbc04",
        cal: "#1967d2"
      },
      boxShadow: {
        card: "0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)",
        modal: "0 4px 8px 3px rgba(60,64,67,.15), 0 1px 3px rgba(60,64,67,.3)"
      }
    }
  },
  plugins: []
};
