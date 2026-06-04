/**
 * @deprecated La barra de navegación se movió a una columna lateral en
 * `<Shell>` (envoltura global en el layout raíz). Este componente se mantiene
 * como no-op para no tener que editar las páginas que aún lo invocan; ya no
 * renderiza nada. Puede eliminarse en una limpieza posterior.
 */
export function Encabezado() {
  return null;
}
