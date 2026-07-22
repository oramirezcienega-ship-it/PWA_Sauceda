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

/**
 * Estructura (chrome) del panel del admin: menú de navegación en una columna
 * lateral en escritorio y un cajón desplegable (☰) en móvil. Envuelve el
 * contenido de todas las páginas internas.
 *
 * En las rutas públicas (login y portal del cliente) no se muestra nada de
 * esto: solo se renderiza el contenido.
 */

const ENLACES = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Expedientes" },
  { href: "/prospectos", label: "Prospectos" },
  { href: "/construccion", label: "Construcción" },
  { href: "/conversaciones", label: "Conversaciones" },
  { href: "/agenda", label: "Agenda" },
];

function esRutaPublica(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/seguimiento") ||
    path.startsWith("/expediente-cliente") ||
    path.startsWith("/privacidad") ||
    path.startsWith("/cotizacion") ||
    path.startsWith("/reporte-visita") ||
    path.startsWith("/agenda/")
  );
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
    return () => clearInterval(id);
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
  }, [pathname]);

  if (esRutaPublica(pathname || "")) return <>{children}</>;

  const enlaces = esAdmin
    ? [
        ...ENLACES,
        { href: "/secuencias", label: "Secuencias" },
        { href: "/dashboard/llamadas", label: "Llamadas" },
        { href: "/reportes", label: "Reportes" },
        { href: "/reportes/dashboard-inteligente", label: "Dashboard Inteligente" },
        { href: "/usuarios", label: "Usuarios" },
        { href: "/consejo", label: "El Consejo" },
        { href: "/admin/gerente", label: "Gerente Operaciones" },
      ]
    : ENLACES;

  const activo = (href: string) =>
    href === "/" ? (pathname || "") === "/" : (pathname || "").startsWith(href);

  const marca = (
    <Link href="/" className="flex items-center gap-2 px-4 py-4 leading-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="SAUCEDA" className="h-9 w-9" />
      <span className="flex flex-col">
        <span className="font-display text-xl font-semibold tracking-tight text-crema">
          SAUCEDA
        </span>
        <span className="font-cuerpo text-[10px] uppercase tracking-[0.2em] text-dorado">
          Bienes Raíces
        </span>
      </span>
    </Link>
  );

  const navegacion = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
      <button
        type="button"
        onClick={() => setBusquedaAbierta(true)}
        className="mb-2 flex w-full items-center justify-between rounded-xl bg-crema/10 hover:bg-crema/20 border border-crema/20 px-3 py-2 text-xs font-bold text-crema transition shadow-xs cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <span>🔍</span>
          <span>Buscar en todo...</span>
        </span>
        <kbd className="rounded bg-black/30 border border-crema/20 px-1.5 py-0.5 text-[9px] font-mono text-crema/70">
          Ctrl+K
        </kbd>
      </button>

      {enlaces.map((l) => {
        const esConversaciones = l.href === "/conversaciones";
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
              activo(l.href)
                ? "bg-crema/15 font-medium text-crema"
                : "text-crema/80 hover:bg-crema/10"
            }`}
          >
            <span>{l.label}</span>
            {esConversaciones && conversacionesPendientes > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rojo px-1.5 text-[10px] font-bold text-crema animate-pulse">
                {conversacionesPendientes > 99 ? "99+" : conversacionesPendientes}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const pie = (
    <div className="flex flex-col gap-2 border-t border-crema/10 px-4 py-3">
      <BotonRegistroBiometria />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-crema/50" title="Versión">
          v{VERSION}
        </span>
        <CerrarSesion />
      </div>
    </div>
  );

  return (
    <div>
      {/* Columna lateral (escritorio) */}
      <aside className="hidden border-r border-dorado/30 bg-verde-profundo text-crema md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-60 md:flex-col">
        <div className="flex items-center justify-between border-b border-crema/10 pr-4">
          {marca}
          
          {/* Campana de Notificaciones en Escritorio */}
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
              <div className="absolute left-[200px] top-2 z-50 w-80 rounded-xl border border-carbon/10 bg-white p-2 shadow-xl text-carbon">
                {renderNotificacionesLista(true)}
                {renderContenidoNotificaciones()}
              </div>
            )}
          </div>
        </div>
        {navegacion}
        {pie}
      </aside>

      {/* Barra superior (móvil) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-dorado/30 bg-verde-profundo px-4 py-3 text-crema md:hidden">
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
        <Link href="/" className="flex items-center gap-2 leading-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="SAUCEDA" className="h-7 w-7" />
          <span className="font-display text-lg font-semibold">SAUCEDA</span>
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
            className="absolute inset-0 bg-carbon/50"
            onClick={() => setAbierto(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col bg-verde-profundo text-crema shadow-xl">
            <div className="flex items-center justify-between">
              {marca}
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="mr-3 rounded-md p-1.5 text-crema/80 transition hover:bg-crema/10"
              >
                ✕
              </button>
            </div>
            {navegacion}
            {pie}
          </aside>
        </div>
      )}

      {/* Contenido (con espacio a la izquierda para la columna en escritorio) */}
      <div className="md:pl-60">{children}</div>

      {/* Modal de Búsqueda Global Omnipresente */}
      <BuscadorGlobalModal
        isOpen={busquedaAbierta}
        onClose={() => setBusquedaAbierta(false)}
      />
    </div>
  );
}
