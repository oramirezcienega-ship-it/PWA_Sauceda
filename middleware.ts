import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { opcionesCookieSeguras } from "@/lib/supabase/cookies";

/**
 * Middleware de autenticación.
 *
 * Protege el panel del admin: si no hay sesión, redirige a /login.
 * Rutas públicas (sin sesión): /login y el portal del cliente /seguimiento/*.
 *
 * También refresca la cookie de sesión de Supabase en cada request.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si falta configuración de auth, no bloqueamos (evita romper el sitio).
  if (!url || !anon) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, opcionesCookieSeguras(options)),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const esPublico =
    path.startsWith("/login") ||
    path.startsWith("/seguimiento") ||
    path.startsWith("/privacidad") ||
    path.startsWith("/cotizacion") ||
    path.startsWith("/agenda");

  if (!user && !esPublico) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  // Aplica a todo menos las rutas /api (tienen su propia seguridad),
  // archivos estáticos y assets de la PWA.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons).*)",
  ],
};
