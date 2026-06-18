import type { Config } from "tailwindcss";

/**
 * Sistema de marca SAUCEDA Bienes Raíces (FIJO).
 * Los colores y fuentes se exponen como design tokens en theme.extend
 * para usarlos en todo el proyecto (ej. bg-crema, text-sauce, font-display).
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta de marca — respetar valores exactos.
        sauce: "#5C7A52", // Verde Sauce
        "verde-profundo": "#2D4A2B", // Verde Profundo
        dorado: "#C9A961", // Dorado Tierra
        crema: "#FFFFFF", // Crema Marfil (ahora Blanco Limpio)
        cielo: "#5C8DAA", // Azul Cielo
        carbon: "#0F172A", // Negro Carbón (ahora Slate 900)
        rojo: "#C44A4A", // Rojo (alertas/errores)
      },
      fontFamily: {
        // Tipografías cargadas con next/font (ver src/app/layout.tsx).
        display: ["var(--font-outfit)", "sans-serif"], // Outfit — display/logo
        titular: ["var(--font-outfit)", "sans-serif"], // Outfit — titulares
        cuerpo: ["var(--font-inter)", "sans-serif"], // Inter — cuerpo/UI
        mono: ["var(--font-jetbrains)", "monospace"], // JetBrains Mono — datos/precios
        fraunces: ["var(--font-fraunces)", "serif"], // Fraunces — títulos del CRM
      },
    },
  },
  plugins: [],
};

export default config;
