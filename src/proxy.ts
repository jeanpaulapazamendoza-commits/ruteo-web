import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * En Next.js 16 el antiguo `middleware.ts` se llama `proxy.ts`.
 * (Los ejemplos de Supabase todavía usan el nombre viejo; con ese
 *  nombre el archivo simplemente no se ejecuta y la sesión no se renueva.)
 *
 * Aquí se refresca el token de Supabase en cada petición y se redirige
 * a /login a quien no tenga sesión.
 */
const RUTAS_PUBLICAS = ["/login", "/registro"];

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesAEscribir) {
          cookiesAEscribir.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          respuesta = NextResponse.next({ request });
          cookiesAEscribir.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No insertar código entre crear el cliente y getUser: cualquier await
  // intermedio puede desincronizar las cookies de sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((p) => ruta.startsWith(p));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("volver", ruta);
    return NextResponse.redirect(url);
  }

  if (user && esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/planificador";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Devolver esta misma respuesta (no una nueva) para conservar las cookies.
  return respuesta;
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo estáticos e imágenes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
