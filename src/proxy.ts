import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { configAuth, RUTAS_PUBLICAS } from "@/auth.config";

/**
 * En Next 16 el antiguo `middleware.ts` se llama `proxy.ts`. Los ejemplos de
 * Auth.js todavía usan el nombre viejo; con ese nombre el archivo no se
 * ejecuta y nadie queda protegido, sin ningún error que lo delate.
 *
 * Se monta con `configAuth` y no con el `auth` completo porque el proxy corre
 * fuera del servidor de render y no puede cargar el driver de base de datos.
 * Aquí solo se lee el token de sesión; quién puede ver qué lo decide después
 * el RLS, en cada consulta.
 */
const { auth } = NextAuth(configAuth);

export const proxy = auth((peticion) => {
  const ruta = peticion.nextUrl.pathname;
  const haySesion = !!peticion.auth?.user;
  const esPublica = RUTAS_PUBLICAS.some((p) => ruta.startsWith(p));

  if (!haySesion && !esPublica) {
    const url = peticion.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("volver", ruta);
    return NextResponse.redirect(url);
  }

  if (haySesion && esPublica) {
    const url = peticion.nextUrl.clone();
    // El conductor no usa el escritorio: su sitio es la app de reparto.
    url.pathname = peticion.auth?.user?.rol === "conductor" ? "/conductor" : "/planificador";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Todo salvo estáticos, imágenes y las rutas de Auth.js.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
