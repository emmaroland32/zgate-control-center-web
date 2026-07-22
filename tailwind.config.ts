import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        controlcenter: {
          50:  "#f0f4ff",
          100: "#e0eaff",
          200: "#c2d4ff",
          300: "#93b4fe",
          400: "#5e8cfc",
          500: "#3b6af8",
          600: "#1e47ed",
          700: "#1535da",
          800: "#172cb1",
          900: "#192b8c",
          950: "#131c5c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
