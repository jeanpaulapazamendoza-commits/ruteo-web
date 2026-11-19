import type { NextAuthConfig } from "next-auth";

/**
 * Configuración que también corre en el proxy.
 *
 * Va aparte de `auth.ts` porque el proxy se ejecuta fuera del servidor de
 * render y no puede arrastrar el driver de base de datos. Aquí solo hay
 * cosas que funcionan en cualquier entorno: la forma de la sesión y a quién
 * se deja pasar. La comprobación de la contraseña vive en `auth.ts`.
 */
export const RUTAS_PUBLICAS = ["/login", "/registro"];

export const configAuth = {
  // Sesión en el propio token, sin tabla de sesiones: ninguna petición
  // necesita consultar la base para saber quién eres. Si la base tarda en
  // despertar, el usuario sigue dentro en vez de acabar en el login.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    /** Lo que se guarda dentro del token. */
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.rol = user.rol;
        token.nombre = user.nombre;
        token.orgId = user.orgId;
        token.empresa = user.empresa;
        token.esDesarrollador = user.esDesarrollador;
      }
      return token;
    },
    /** Lo que ve la aplicación al pedir la sesión. */
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.rol = token.rol;
      session.user.nombre = token.nombre ?? null;
      session.user.orgId = token.orgId ?? null;
      session.user.empresa = token.empresa ?? null;
      session.user.esDesarrollador = token.esDesarrollador ?? false;
      return session;
    },
  },
} satisfies NextAuthConfig;
