import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: "#0a0a1a",
          800: "#111128",
          700: "#1a1a36",
          600: "#232344",
          500: "#2d2d52",
        },
        rose: {
          accent: "#f43f7a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
