"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CerrarSesion } from "./CerrarSesion";
import { BotonRegistroBiometria } from "./BotonRegistroBiometria";
import { VERSION } from "@/lib/version";
import { rolUsuarioActual } from "@/app/actions/usuarios";
import { cerrarSesion } from "@/app/actions/auth";
import {
  listarNotificaciones,
  marcarNotificacionLeida,
  marcarTodasComoLeidas,
  eliminarNotificacion,
  eliminarTodasLasNotificaciones,
  type NotificacionApp,
} from "@/app/actions/notificaciones";
import { contarConversacionesPendientes } from "@/app/actions/conversaciones";
import { BuscadorGlobalModal } from "./BuscadorGlobalModal";
import { HeaderActividadesSemana } from "./HeaderActividadesSemana";
import {
  IconoConversaciones,
  IconoPipeline,
  IconoCotizaciones,
  IconoOrdenesTrabajo,
  IconoProspectos,
  IconoNegocios,
  IconoEmpresas,
  IconoComisiones,
  IconoConstruccion,
  IconoProveedores,
  IconoAgenda,
  IconoFinanzas,
  IconoVisualizadorIA,
  IconoChatwoot,
  IconoPublicacionesIA,
  IconoSecuencias,
  IconoLlamadas,
  IconoDashboard,
  IconoDashboardInteligente,
  IconoReportes,
  IconoConsejo,
  IconoGerente,
  IconoProcesosBPM,
  IconoUsuarios,
  IconoChevronAbajo,
  IconoFuego,
  IconoRemisiones,
  IconoProductos,
} from "./IconosNav";

/**
 * Estructura (chrome) del panel del admin: menú de navegación en una columna
 * lateral en escritorio y un cajón desplegable (☰) en móvil. Envuelve el
 * contenido de todas las páginas internas.
 *
 * En las rutas públicas (login y portal del cliente) no se muestra nada de
 * esto: solo se renderiza el contenido.
 */

function esRutaPublica(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/visualizador") ||
    path.startsWith("/seguimiento") ||
    path.startsWith("/expediente-cliente") ||
    path.startsWith("/privacidad") ||
    path.startsWith("/cotizacion") ||
    path.startsWith("/reporte-visita") ||
    path.startsWith("/agenda/") ||
    path.startsWith("/recibo/") ||
    path.startsWith("/contrato-pdf/") ||
    path.startsWith("/garantia/") ||
    path.startsWith("/orden-trabajo/entrega/") ||
    path.startsWith("/orden-trabajo/remision/")
  );
}

const CLAVE_HISTORIAL = "sauceda_historial_nav";

/**
 * Pantalla "de arriba" cuando no hay una anterior a la cual regresar
 * (p. ej. se abrió un enlace directo o la app recién se abrió).
 */
function rutaPadre(path: string): string {
  const segs = path.split("/").filter(Boolean);
  segs.pop();
  const padre = "/" + segs.join("/");
  if (padre === "/expediente") return "/";
  if (padre === "/agenda/cita") return "/agenda";
  return padre;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [esAdmin, setEsAdmin] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState<NotificacionApp[]>([]);
  const [notifsAbierto, setNotifsAbierto] = useState(false);
  const [conversacionesPendientes, setConversacionesPendientes] = useState(0);
  const [notificadosIds, setNotificadosIds] = useState<string[]>([]);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [colapsada, setColapsada] = useState(false);
  const [gruposColapsados, setGruposColapsados] = useState<Record<string, boolean>>({});
  const [currentSearch, setCurrentSearch] = useState("");
  const [hayAnterior, setHayAnterior] = useState(false);

  // Historial propio de pantallas internas: en la app instalada (móvil) no hay
  // botón de atrás del navegador, así que el "←" de la barra lo usa.
  useEffect(() => {
    if (!pathname || esRutaPublica(pathname)) return;
    try {
      const pila: string[] = JSON.parse(sessionStorage.getItem(CLAVE_HISTORIAL) || "[]");
      if (pila[pila.length - 1] === pathname) {
        // recarga de la misma pantalla
      } else if (pila[pila.length - 2] === pathname) {
        pila.pop(); // se regresó a la pantalla anterior
      } else {
        pila.push(pathname);
      }
      const recortada = pila.slice(-50);
      sessionStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(recortada));
      setHayAnterior(recortada.length > 1);
    } catch {
      setHayAnterior(false);
    }
  }, [pathname]);

  const regresar = () => {
    if (hayAnterior) router.back();
    else router.push(rutaPadre(pathname || "/"));
  };

  useEffect(() => {
    try {
      const guardado = localStorage.getItem("sauceda_sidebar_colapsada");
      if (guardado !== null) {
        setColapsada(guardado === "true");
      }
      const gruposGuardados = localStorage.getItem("sauceda_sidebar_grupos_colapsados");
      if (gruposGuardados) {
        setGruposColapsados(JSON.parse(gruposGuardados));
      }
    } catch {}
  }, []);

  useEffect(() => {
    const updateSearch = () => {
      if (typeof window !== "undefined") {
        setCurrentSearch(window.location.search);
      }
    };
    updateSearch();
    window.addEventListener("popstate", updateSearch);
    return () => window.removeEventListener("popstate", updateSearch);
  }, [pathname]);

  const toggleSidebar = () => {
    setColapsada((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sauceda_sidebar_colapsada", String(next));
      } catch {}
      return next;
    });
  };

  const toggleGrupo = (grupoId: string) => {
    setGruposColapsados((prev) => {
      const next = { ...prev, [grupoId]: !prev[grupoId] };
      try {
        localStorage.setItem("sauceda_sidebar_grupos_colapsados", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Atajos de teclado: Ctrl+B para barra lateral, Escape para cerrar modales/cajón
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        setNotifsAbierto(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    rolUsuarioActual()
      .then((rol) => setEsAdmin(rol === "admin"))
      .catch(() => setEsAdmin(false));
  }, []);

  // Solicitar permiso de notificaciones al montar la PWA
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Cierra el cajón al cambiar de ruta.
  useEffect(() => {
    setAbierto(false);
    setNotifsAbierto(false);
  }, [pathname]);

  const lanzarNotificacionNativa = (n: NotificacionApp) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const options: any = {
      body: n.cuerpo,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: "sauceda-pwa-notif-" + n.id,
      renotify: true,
      requireInteraction: true, // Notificación persistente tanto en Android como iOS PWA
      vibrate: [200, 100, 200],
      data: { enlace: n.enlace }
    };

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(n.titulo, options);
      });
    } else {
      new Notification(n.titulo, {
        body: n.cuerpo,
        icon: "/icons/icon.svg",
        requireInteraction: true
      });
    }
  };

  const refrescarNotificaciones = async () => {
    if (esRutaPublica(pathname || "")) return;
    try {
      const [lista, pendientes] = await Promise.all([
        listarNotificaciones(),
        contarConversacionesPendientes(),
      ]);

      // Evaluar nuevas notificaciones sin leer para disparar la alerta nativa
      setNotificadosIds((prevIds) => {
        // En la primera carga no alertamos del histórico, solo registramos los IDs
        if (prevIds.length === 0) {
          return lista.map((n) => n.id);
        }

        const nuevosIds = [...prevIds];
        lista.forEach((n) => {
          if (!n.leido && !prevIds.includes(n.id)) {
            lanzarNotificacionNativa(n);
            nuevosIds.push(n.id);
          }
        });
        return nuevosIds;
      });

      setNotificaciones(lista);
      setConversacionesPendientes(pendientes);
    } catch (err) {
      console.error("Error al cargar notificaciones:", err);
    }
  };

  useEffect(() => {
    if (esRutaPublica(pathname || "")) return;
    refrescarNotificaciones();
    const id = setInterval(refrescarNotificaciones, 15000);
    // Al volver a primer plano (abrir la PWA, desbloquear) no esperar al siguiente ciclo.
    const alVolver = () => {
      if (document.visibilityState === "visible") refrescarNotificaciones();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [pathname]);

  const unreadCount = notificaciones.filter((n) => !n.leido).length;

  const clickNotificacion = async (n: NotificacionApp) => {
    setNotifsAbierto(false);
    if (!n.leido) {
      setNotificaciones((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, leido: true } : x))
      );
      await marcarNotificacionLeida(n.id);
    }
    if (n.enlace) {
      router.push(n.enlace || "");
    }
  };

  const clickMarcarTodas = async () => {
    setNotificaciones((prev) => prev.map((x) => ({ ...x, leido: true })));
    await marcarTodasComoLeidas();
  };

  const clickEliminarTodas = async () => {
    setNotificaciones([]);
    await eliminarTodasLasNotificaciones();
  };

  const clickEliminar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setNotificaciones((prev) => prev.filter((x) => x.id !== id));
    await eliminarNotificacion(id);
  };

  const IconoCampana = () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );

  const renderNotificacionesLista = (isDesktop: boolean) => (
    <div className="flex items-center justify-between border-b border-carbon/5 px-3 py-2 pb-2">
      <span className="text-sm font-semibold">Notificaciones</span>
      <div className="flex gap-2.5">
        {unreadCount > 0 && (
          <button
            onClick={clickMarcarTodas}
            className="text-[11px] font-medium text-sauce hover:underline"
          >
            Marcar todo leído
          </button>
        )}
        {notificaciones.length > 0 && (
          <button
            onClick={clickEliminarTodas}
            className="text-[11px] font-medium text-rojo hover:underline"
          >
            Borrar todo
          </button>
        )}
      </div>
    </div>
  );

  const renderContenidoNotificaciones = () => (
    <div className="max-h-96 overflow-y-auto py-1 scrollbar-sutil">
      {notificaciones.length === 0 ? (
        <div className="py-6 text-center text-xs text-carbon/40 font-cuerpo">
          No tienes notificaciones
        </div>
      ) : (
        notificaciones.map((n) => (
          <div
            key={n.id}
            onClick={() => clickNotificacion(n)}
            className={`relative flex cursor-pointer gap-2 rounded-lg px-3 py-2.5 transition hover:bg-carbon/5 ${
              !n.leido ? "bg-sauce/5" : ""
            }`}
          >
            {!n.leido && (
              <span className="absolute left-1.5 top-3.5 h-1.5 w-1.5 rounded-full bg-sauce" />
            )}
            <div className="flex-1 pl-1.5">
              <p className={`text-xs leading-snug font-cuerpo ${!n.leido ? "font-semibold text-verde-profundo" : "text-carbon"}`}>
                {n.titulo}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-carbon/60 line-clamp-2 font-cuerpo">
                {n.cuerpo}
              </p>
              <p className="mt-1 text-[9px] text-carbon/40 font-mono">
                {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button
              onClick={(e) => clickEliminar(e, n.id)}
              className="text-[10px] text-carbon/30 hover:text-rojo p-1"
              title="Eliminar"
            >
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );

  // Monitorear inactividad del usuario (30 minutos)
  useEffect(() => {
    if (esRutaPublica(pathname || "")) return;
    if (esAdmin) return;

    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await cerrarSesion();
          window.location.href = "/login";
        } catch (error) {
          console.error("Error al cerrar sesión por inactividad:", error);
        }
      }, 30 * 60 * 1000); // 30 minutos de inactividad
    };

    const eventos = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];

    resetTimer();

    eventos.forEach((evento) => {
      window.addEventListener(evento, resetTimer, { passive: true });
    });

    return () => {
      clearTimeout(timer);
      eventos.forEach((evento) => {
        window.removeEventListener(evento, resetTimer);
      });
    };
  }, [pathname, esAdmin]);

  if (esRutaPublica(pathname || "")) return <>{children}</>;

  interface ElementoNav {
    href: string;
    label: string;
    icono: React.ComponentType<{ className?: string }>;
    badge?: "contador" | "nuevo";
    esAdminOnly?: boolean;
  }

  interface CategoriaNav {
    id: string;
    titulo: string;
    icono?: React.ComponentType<{ className?: string }>;
    esAdminOnly?: boolean;
    items: ElementoNav[];
  }

  const categorias: CategoriaNav[] = [
    {
      id: "frecuentes",
      titulo: "Mi Día a Día",
      icono: IconoFuego,
      items: [
        {
          href: "/conversaciones",
          label: "Conversaciones",
          icono: IconoConversaciones,
          badge: "contador",
        },
        {
          href: "/prospectos/pipeline",
          label: "Pipeline",
          icono: IconoPipeline,
        },
        {
          href: "/construccion?tab=cotizaciones",
          label: "Cotizaciones",
          icono: IconoCotizaciones,
        },
        {
          href: "/ordenes-trabajo",
          label: "Órdenes de Trabajo",
          icono: IconoOrdenesTrabajo,
          badge: "nuevo",
        },
        {
          href: "/remisiones",
          label: "Remisiones y Facturas",
          icono: IconoRemisiones,
        },
      ],
    },
    {
      id: "comercial",
      titulo: "Comercial & Negocios",
      items: [
        {
          href: "/prospectos",
          label: "Prospectos",
          icono: IconoProspectos,
        },
        {
          href: "/",
          label: "Negocios",
          icono: IconoNegocios,
        },
        {
          href: "/empresas",
          label: "Empresas",
          icono: IconoEmpresas,
        },
        {
          href: "/comisiones",
          label: "Comisiones",
          icono: IconoComisiones,
        },
      ],
    },
    {
      id: "operaciones",
      titulo: "Operaciones & Obra",
      items: [
        {
          href: "/construccion",
          label: "Presupuestos de Obra",
          icono: IconoConstruccion,
        },
        {
          href: "/productos",
          label: "Productos y Servicios",
          icono: IconoProductos,
        },
        {
          href: "/proveedores",
          label: "Proveedores",
          icono: IconoProveedores,
        },
        {
          href: "/agenda",
          label: "Agenda",
          icono: IconoAgenda,
        },
        {
          href: "/finanzas",
          label: "Finanzas",
          icono: IconoFinanzas,
          esAdminOnly: true,
        },
      ],
    },
    {
      id: "ia",
      titulo: "Inteligencia IA",
      items: [
        {
          href: "/visualizador",
          label: "Visualizador IA",
          icono: IconoVisualizadorIA,
          badge: "nuevo",
        },
        {
          href: "/chatwoot",
          label: "Chatwoot",
          icono: IconoChatwoot,
          badge: "nuevo",
        },
        {
          href: "/admin/publicaciones",
          label: "Publicaciones IA",
          icono: IconoPublicacionesIA,
          esAdminOnly: true,
        },
        {
          href: "/secuencias",
          label: "Secuencias",
          icono: IconoSecuencias,
          esAdminOnly: true,
        },
        {
          href: "/dashboard/llamadas",
          label: "Llamadas",
          icono: IconoLlamadas,
          esAdminOnly: true,
        },
      ],
    },
    {
      id: "gestion",
      titulo: "Estrategia & Control",
      esAdminOnly: true,
      items: [
        {
          href: "/dashboard",
          label: "Dashboard",
          icono: IconoDashboard,
        },
        {
          href: "/reportes/dashboard-inteligente",
          label: "Dashboard Inteligente",
          icono: IconoDashboardInteligente,
        },
        {
          href: "/reportes",
          label: "Reportes",
          icono: IconoReportes,
        },
        {
          href: "/consejo",
          label: "El Consejo",
          icono: IconoConsejo,
        },
        {
          href: "/admin/gerente",
          label: "Gerente Operaciones",
          icono: IconoGerente,
        },
        {
          href: "/admin/procesos",
          label: "Procesos BPM",
          icono: IconoProcesosBPM,
        },
        {
          href: "/usuarios",
          label: "Usuarios",
          icono: IconoUsuarios,
        },
      ],
    },
  ];

  const esActivo = (href: string) => {
    const currentPath = pathname || "";
    const [targetPath, targetQuery] = href.split("?");

    if (targetQuery) {
      return (
        currentPath === targetPath &&
        (currentSearch.includes(targetQuery) ||
          (targetQuery === "tab=cotizaciones" &&
            (!currentSearch || currentSearch.includes("tab=cotizaciones"))))
      );
    }

    if (href === "/") {
      return currentPath === "/";
    }

    if (href === "/prospectos") {
      return (
        currentPath === "/prospectos" ||
        (currentPath.startsWith("/prospectos/") &&
          !currentPath.startsWith("/prospectos/pipeline"))
      );
    }

    if (href === "/dashboard") {
      return currentPath === "/dashboard";
    }

    if (href === "/reportes") {
      return currentPath === "/reportes";
    }

    if (href.startsWith("/construccion")) {
      return (
        currentPath === "/construccion" &&
        currentSearch.includes("tab=catalogo")
      );
    }

    return currentPath === href || currentPath.startsWith(href + "/");
  };

  const marca = (
    <Link href="/" className="flex items-center gap-2.5 px-3 py-3 leading-none group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="SAUCEDA"
        className="h-8.5 w-8.5 transition-transform duration-200 group-hover:scale-105"
      />
      <span className="flex flex-col">
        <span className="font-display text-[19px] font-bold tracking-tight text-white group-hover:text-dorado transition-colors">
          SAUCEDA
        </span>
        <span className="font-cuerpo text-[9px] uppercase tracking-[0.22em] text-dorado font-semibold">
          Bienes Raíces
        </span>
      </span>
    </Link>
  );

  const navegacion = (
    <nav className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 py-2.5 scrollbar-sutil">
      <button
        type="button"
        onClick={() => setBusquedaAbierta(true)}
        className="group flex w-full items-center justify-between rounded-xl bg-black/25 hover:bg-black/35 border border-crema/10 hover:border-dorado/40 px-3 py-2 text-xs text-crema transition-all shadow-inner cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <svg
            className="h-3.5 w-3.5 text-dorado/80 transition group-hover:text-dorado"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-[12px] text-crema/80 group-hover:text-white">Buscar en todo...</span>
        </span>
        <kbd className="rounded bg-black/40 border border-crema/20 px-1.5 py-0.5 text-[9px] font-mono text-crema/70 shadow-xs">
          Ctrl+K
        </kbd>
      </button>

      <div className="flex flex-col gap-3">
        {categorias
          .filter((cat) => !cat.esAdminOnly || esAdmin)
          .map((cat) => {
            const itemsVisibles = cat.items.filter(
              (item) => !item.esAdminOnly || esAdmin
            );
            if (itemsVisibles.length === 0) return null;

            const colapsado = !!gruposColapsados[cat.id];
            const IconoCat = cat.icono;
            const esFrecuentes = cat.id === "frecuentes";

            return (
              <div
                key={cat.id}
                className={`flex flex-col rounded-xl transition-colors ${
                  esFrecuentes ? "bg-black/15 p-1 border border-dorado/20" : ""
                }`}
              >
                {/* Encabezado del grupo */}
                <button
                  type="button"
                  onClick={() => toggleGrupo(cat.id)}
                  className={`flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer select-none group ${
                    esFrecuentes
                      ? "text-dorado"
                      : "text-dorado/80 hover:text-dorado"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {IconoCat && <IconoCat className="h-3 w-3 text-dorado" />}
                    <span>{cat.titulo}</span>
                  </span>
                  <IconoChevronAbajo
                    className={`h-3 w-3 text-dorado/60 transition-transform duration-200 group-hover:text-dorado ${
                      colapsado ? "-rotate-90" : "rotate-0"
                    }`}
                  />
                </button>

                {/* Items del grupo */}
                {!colapsado && (
                  <div className="flex flex-col gap-0.5 mt-0.5 animate-in fade-in duration-150">
                    {itemsVisibles.map((item) => {
                      const isActivo = esActivo(item.href);
                      const Icono = item.icono;
                      const esConversaciones = item.href === "/conversaciones";

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            setAbierto(false);
                            const [, query] = item.href.split("?");
                            setCurrentSearch(query ? `?${query}` : "");
                          }}
                          className={`group relative flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] transition-all duration-150 ${
                            isActivo
                              ? "bg-dorado/15 font-semibold text-white shadow-xs border border-dorado/30"
                              : "text-crema/80 hover:bg-white/8 hover:text-white border border-transparent"
                          }`}
                        >
                          {isActivo && (
                            <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-dorado" />
                          )}

                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icono
                              className={`h-4 w-4 shrink-0 transition-colors ${
                                isActivo
                                  ? "text-dorado"
                                  : "text-crema/60 group-hover:text-dorado"
                              }`}
                            />
                            <span className="truncate">{item.label}</span>
                          </div>

                          {/* Badges */}
                          {esConversaciones && conversacionesPendientes > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rojo px-1.5 text-[10px] font-bold text-white shadow-xs animate-pulse">
                              {conversacionesPendientes > 99
                                ? "99+"
                                : conversacionesPendientes}
                            </span>
                          )}

                          {item.badge === "nuevo" && (
                            <span className="rounded-full bg-dorado/20 border border-dorado/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-dorado shrink-0">
                              Nuevo
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </nav>
  );

  const pie = (
    <div className="flex flex-col gap-2.5 border-t border-crema/10 bg-black/15 px-3.5 py-3">
      <BotonRegistroBiometria />
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] text-crema/60"
          title="Versión de la plataforma"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          v{VERSION}
        </span>
        <CerrarSesion />
      </div>
    </div>
  );

  return (
    <div>
      {/* Botón flotante para reabrir la barra en escritorio cuando está oculta */}
      {colapsada && (
        <button
          type="button"
          onClick={toggleSidebar}
          title="Mostrar barra lateral (Ctrl+B)"
          className="hidden md:flex fixed top-3 left-3 z-40 items-center gap-2 rounded-xl bg-verde-profundo/95 hover:bg-verde-profundo text-crema border border-dorado/40 px-3 py-2 text-xs font-semibold shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer group animate-in fade-in zoom-in-95 duration-200"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-dorado transition group-hover:translate-x-0.5"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 3v18" />
            <path d="m13 15 3-3-3-3" />
          </svg>
          <span className="font-display font-medium tracking-wide">Menú</span>
          <kbd className="hidden lg:inline-block rounded bg-black/30 border border-crema/20 px-1 py-0.5 text-[9px] font-mono text-crema/60">
            Ctrl+B
          </kbd>
        </button>
      )}

      {/* Columna lateral (escritorio) */}
      <aside
        className={`hidden border-r border-dorado/30 bg-verde-profundo text-crema md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-64 md:flex-col transition-transform duration-300 ease-in-out ${
          colapsada ? "md:-translate-x-full" : "md:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-crema/10 pr-3">
          {marca}
          
          <div className="flex items-center gap-1">
            {/* Campana de Notificaciones en Escritorio */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifsAbierto(!notifsAbierto)}
                className="relative rounded-md p-1.5 text-crema/80 transition hover:bg-crema/10 hover:text-crema cursor-pointer"
                aria-label="Notificaciones"
              >
                <IconoCampana />
                {unreadCount > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rojo text-[9px] font-bold text-crema">
                    {unreadCount}
                  </span>
                )}
              </button>
              {notifsAbierto && (
                <div className="absolute left-full top-2 ml-3 z-50 w-80 rounded-xl border border-carbon/10 bg-white p-2 shadow-xl text-carbon">
                  {renderNotificacionesLista(true)}
                  {renderContenidoNotificaciones()}
                </div>
              )}
            </div>

            {/* Botón para ocultar/colapsar la barra lateral */}
            <button
              type="button"
              onClick={toggleSidebar}
              title="Ocultar barra lateral (Ctrl+B)"
              className="rounded-md p-1.5 text-crema/80 transition hover:bg-crema/10 hover:text-crema cursor-pointer"
              aria-label="Ocultar barra lateral"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m15 9-3 3 3 3" />
              </svg>
            </button>
          </div>
        </div>
        {navegacion}
        {pie}
      </aside>

      {/* Barra superior (móvil) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-dorado/30 bg-verde-profundo px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-crema md:hidden">
        <div className="flex items-center gap-0.5">
        {pathname !== "/" && (
          <button
            type="button"
            onClick={regresar}
            aria-label="Regresar a la pantalla anterior"
            title="Regresar"
            className="rounded-md p-1.5 transition hover:bg-crema/10 active:bg-crema/20"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="rounded-md p-1.5 transition hover:bg-crema/10"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        </div>
        <Link href="/" className="flex min-w-0 items-center gap-2 leading-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="SAUCEDA" className="h-7 w-7 shrink-0" />
          <span className="hidden min-[400px]:inline font-display text-lg font-semibold">SAUCEDA</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setBusquedaAbierta(true)}
            className="rounded-md p-1.5 text-crema/80 transition hover:bg-crema/10 hover:text-crema"
            title="Buscar en todo el sistema"
          >
            🔍
          </button>
          {/* Campana de Notificaciones en Móvil */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifsAbierto(!notifsAbierto)}
              className="relative rounded-md p-1.5 text-crema/80 transition hover:bg-crema/10 hover:text-crema"
              aria-label="Notificaciones"
            >
              <IconoCampana />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rojo text-[9px] font-bold text-crema">
                  {unreadCount}
                </span>
              )}
            </button>
            {notifsAbierto && (
              <div className="fixed right-4 top-14 z-50 w-[90vw] max-w-sm rounded-xl border border-carbon/10 bg-white p-2 shadow-xl text-carbon">
                {renderNotificacionesLista(false)}
                {renderContenidoNotificaciones()}
              </div>
            )}
          </div>
          <CerrarSesion />
        </div>
      </header>

      {/* Cajón desplegable (móvil) */}
      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-carbon/50 backdrop-blur-xs transition-opacity"
            onClick={() => setAbierto(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-verde-profundo text-crema shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pr-2 border-b border-crema/10">
              {marca}
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="rounded-md p-2 text-crema/80 transition hover:bg-crema/10 hover:text-crema cursor-pointer"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {navegacion}
            {pie}
          </aside>
        </div>
      )}

      {/* Contenido (con espacio a la izquierda para la columna en escritorio) */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          colapsada ? "md:pl-0" : "md:pl-64"
        }`}
      >
        {/* Barra superior de actividades de la semana (móvil y escritorio).
            En Conversaciones (móvil) se oculta para dar el espacio a la bandeja.
            `contents` conserva el sticky de la barra. */}
        <div className={pathname?.startsWith("/conversaciones") ? "hidden md:contents" : "contents"}>
          <HeaderActividadesSemana />
        </div>

        {children}
      </div>

      {/* Modal de Búsqueda Global Omnipresente */}
      <BuscadorGlobalModal
        isOpen={busquedaAbierta}
        onClose={() => setBusquedaAbierta(false)}
      />
    </div>
  );
}
