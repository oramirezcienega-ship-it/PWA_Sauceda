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
        crema: "#F5F1E8", // Crema Marfil
        cielo: "#5C8DAA", // Azul Cielo
        carbon: "#1A1A1A", // Negro Carbón
        rojo: "#C44A4A", // Rojo (alertas/errores)
      },
      fontFamily: {
        // Tipografías cargadas con next/font (ver src/app/layout.tsx).
        display: ["var(--font-fraunces)", "serif"], // Fraunces — display/logo
        titular: ["var(--font-cormorant)", "serif"], // Cormorant Garamond — titulares
        cuerpo: ["var(--font-inter)", "sans-serif"], // Inter — cuerpo/UI
        mono: ["var(--font-jetbrains)", "monospace"], // JetBrains Mono — datos/precios
      },
    },
  },
  plugins: [],
};

export default config;
