import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...configAuth,
  providers: [
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
        const perfil = filas[0]?.iniciar_sesion;
        if (!perfil) return null;

        // Un usuario desactivado, o uno cuya empresa está suspendida, no
        // llega a tener sesión. Aun si la tuviera, `private.mi_org()` le
        // devolvería null y no vería ningún dato: esto es la primera puerta,
        // no la única.
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
      },
    }),
  ],
});
