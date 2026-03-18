import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        dark: {
          900: "#0a0a1a",
          800: "#0f0f2a",
          700: "#14143a",
          600: "#1a1a4a",
          500: "#24245a",
          bg: "#0a0a1a",
          border: "#1e1e3a",
        },
        accent: {
          DEFAULT: "#3b82f6",
          light: "#60a5fa",
          dark: "#2563eb",
          glow: "rgba(59, 130, 246, 0.3)",
        },
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
          card: "#1a1a3e",
          accent: "#c084fc",
          violet: "#8b5cf6",
        },
        "brand-dark": "#0a0a1a",
      },
      animation: {
        marquee: "marquee 30s linear infinite",
        marquee2: "marquee2 30s linear infinite",
        gradient: "gradient 6s ease infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        flash: "flash 0.5s ease-in-out 3",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-100%)" },
        },
        marquee2: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0%)" },
        },
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(59, 130, 246, 0.2)" },
          "50%": { boxShadow: "0 0 40px rgba(59, 130, 246, 0.4)" },
        },
        flash: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
