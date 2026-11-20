import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { configAuth } from "@/auth.config";
import { comoServicio } from "@/lib/db";

type PerfilSesion = {
  id: string;
  nombre: string | null;
  email: string | null;
  rol: "admin" | "planificador" | "conductor";
  activo: boolean;
  es_desarrollador: boolean;
  org_id: string | null;
  empresa: string | null;
  empresa_activa: boolean;
};

/** La sesión que se entrega a Auth.js, o null si esa cuenta no puede entrar. */
function sesionDe(perfil: PerfilSesion | null | undefined) {
  if (!perfil) return null;

  // Un usuario desactivado, o uno cuya empresa está suspendida, no llega a
  // tener sesión. Aun si la tuviera, `private.mi_org()` le devolvería null y
  // no vería ningún dato: esto es la primera puerta, no la única.
  if (!perfil.activo) return null;
  if (perfil.org_id && !perfil.empresa_activa) return null;

  return {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    rol: perfil.rol,
    orgId: perfil.org_id,
    empresa: perfil.empresa,
    esDesarrollador: perfil.es_desarrollador,
  };
}

/**
 * Entrar con Google está disponible solo si hay credenciales configuradas.
 *
 * Sin esta comprobación, un despliegue al que le falten las variables
 * mostraría el botón y llevaría al usuario a una pantalla de error de Google.
 * Así el formulario sabe que no debe ofrecerlo.
 */
export const HAY_GOOGLE = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...configAuth,
  callbacks: {
    ...configAuth.callbacks,
    /**
     * Última puerta antes de crear la sesión.
     *
     * Con Google, `profile()` ya rechaza lo que no tiene perfil devolviendo
     * un usuario sin `id`; aquí se corta, y Auth.js manda al usuario de
     * vuelta al login con `error=AccessDenied`.
     */
    signIn({ user }) {
      return Boolean(user?.id);
    },
  },
  providers: [
    /**
     * Entrada con Google.
     *
     * No da de alta a nadie: busca el perfil por el correo que Google
     * confirma, y si no existe no deja pasar. En un sistema de varias
     * empresas, crear la cuenta sola dejaría entrar a cualquiera con un
     * Google a una empresa que no es la suya.
     *
     * `allowDangerousEmailAccountLinking` no hace falta: sin adaptador de
     * base no hay tabla de cuentas que enlazar, la correspondencia es el
     * correo y se resuelve aquí.
     */
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      async profile(perfilGoogle) {
        const vacio = {
          id: "",
          email: perfilGoogle.email ?? null,
          nombre: null,
          rol: "conductor" as const,
          orgId: null,
          empresa: null,
          esDesarrollador: false,
        };

        // Google marca si ha verificado el correo. Sin esa marca, el correo
        // es solo un texto que el titular de la cuenta pudo poner a mano, y
        // aquí el correo es justo lo que decide a qué perfil se entra.
        if (!perfilGoogle.email_verified || !perfilGoogle.email) return vacio;

        const filas = await comoServicio<{ perfil_por_email: PerfilSesion | null }>(
          "select public.perfil_por_email($1) as perfil_por_email",
          [perfilGoogle.email.trim().toLowerCase()],
        );

        return sesionDe(filas[0]?.perfil_por_email) ?? vacio;
      },
    }),
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        clave: { label: "Contraseña", type: "password" },
      },
      /**
       * La contraseña se comprueba dentro de Postgres: `iniciar_sesion`
       * compara el hash ahí mismo, de modo que el hash nunca viaja hasta
       * aquí. Devuelve null si el correo no existe o la clave no coincide,
       * sin decir cuál de las dos falló.
       */
      async authorize(credenciales) {
        const email = String(credenciales?.email ?? "").trim().toLowerCase();
        const clave = String(credenciales?.clave ?? "");
        if (!email || !clave) return null;

        const filas = await comoServicio<{ iniciar_sesion: PerfilSesion | null }>(
          "select public.iniciar_sesion($1, $2) as iniciar_sesion",
          [email, clave],
        );
        return sesionDe(filas[0]?.iniciar_sesion);
      },
    }),
  ],
});
