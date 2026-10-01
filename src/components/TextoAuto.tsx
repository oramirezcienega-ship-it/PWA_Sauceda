"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Textarea que crece con su contenido: en móvil se ve todo el texto y se puede
 * tocar cualquier punto para editarlo, sin desplazarse dentro de la casilla.
 */
export function TextoAuto({
  value,
  onChange,
  className,
  minRows = 2,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  minRows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      className={`${className} resize-none overflow-hidden`}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
