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
        mystic: {
          bg: "#0a0a1a",
          deep: "#0d0d24",
          purple: "#7b2ff7",
          "purple-light": "#a855f7",
          gold: "#d4a017",
          "gold-light": "#f0d060",
          blue: "#1e3a5f",
          surface: "#12122a",
          border: "#1f1f3a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
