import type { Metadata, Viewport } from "next";
import {
  Outfit,
  Inter,
  JetBrains_Mono,
  Fraunces,
} from "next/font/google";
import "./globals.css";
import { ExpedientesProvider } from "@/context/expedientes-context";
import { RegistrarSW } from "@/components/RegistrarSW";
import { Shell } from "@/components/Shell";

// Tipografías de marca cargadas con next/font (se exponen como variables CSS
// y se enlazan a los tokens font-* en tailwind.config.ts).
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAUCEDA · BPM de Traspasos INFONAVIT",
  description: "Tradición con tecnología.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon.svg",
    shortcut: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SAUCEDA",
  },
};

export const viewport: Viewport = {
  themeColor: "#2D4A2B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${outfit.variable} ${inter.variable} ${jetbrains.variable} ${fraunces.variable}`}
    >
      <body>
        {/* Provider global del estado de expedientes (en memoria). */}
        <ExpedientesProvider>
          {/* Navegación lateral (escritorio) / cajón (móvil) + contenido. */}
          <Shell>{children}</Shell>
        </ExpedientesProvider>
        {/* Registro del service worker para que la app sea instalable. */}
        <RegistrarSW />
      </body>
    </html>
  );
}
