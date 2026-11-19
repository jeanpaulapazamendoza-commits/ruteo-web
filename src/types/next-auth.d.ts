import type { DefaultSession } from "next-auth";

type Rol = "admin" | "planificador" | "conductor";

/**
 * Lo que la aplicación guarda de cada usuario en la sesión. Son los datos
 * que deciden qué menú ve y a qué pantallas puede entrar; los permisos
 * reales sobre los datos los sigue imponiendo el RLS de la base.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      rol: Rol;
      nombre: string | null;
      orgId: string | null;
      empresa: string | null;
      esDesarrollador: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    rol: Rol;
    nombre: string | null;
    orgId: string | null;
    empresa: string | null;
    esDesarrollador: boolean;
  }
}

// Se aumenta `@auth/core/jwt` y no `next-auth/jwt`: este último solo
// reexporta del primero, y una declaración sobre un reexporte no se fusiona
// con la interfaz original — los campos añadidos saldrían como `unknown`.
declare module "@auth/core/jwt" {
  interface JWT {
    rol: Rol;
    nombre?: string | null;
    orgId?: string | null;
    empresa?: string | null;
    esDesarrollador?: boolean;
  }
}
