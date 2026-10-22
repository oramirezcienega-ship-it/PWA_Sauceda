"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/dashboard/llamadas", label: "Historial del Conmutador" },
  { href: "/dashboard/llamadas/ia", label: "Llamadas IA" },
];

/** Subsecciones de Llamadas. */
export function PestanasLlamadas() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex gap-1 border-b border-carbon/10">
      {PESTANAS.map((p) => {
        const activa = pathname === p.href;
        return (
          <Link
            key={p.href}
            href={p.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              activa
                ? "border-sauce text-verde-profundo"
                : "border-transparent text-carbon/50 hover:text-verde-profundo"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
