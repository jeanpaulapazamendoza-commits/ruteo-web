import { unaFila } from "@/lib/db";

const ROL: Record<string, string> = {
  admin: "Administrador",
  planificador: "Planificador",
  conductor: "Conductor",
};

/**
 * Lo que enseña «Mi perfil», lo vea quien lo vea: en la oficina va dentro de
 * la configuración (`/perfil`) y el conductor lo abre desde su app
 * (`/cuenta`).
 */
export async function miCuenta(usuario: string) {
  const yo = await unaFila<{
    nombre: string | null;
    telefono: string | null;
    email: string | null;
    rol: string;
    empresa: string | null;
    // Quien entró con Google puede no tener contraseña todavía.
    tiene_clave: boolean;
  }>(
    usuario,
    `select p.nombre, p.telefono, p.email, p.rol, o.nombre as empresa,
            public.tengo_clave() as tiene_clave
       from perfiles p
       left join organizaciones o on o.id = p.org_id
      where p.id = $1`,
    [usuario],
  );
  if (!yo) return null;
  return {
    nombre: yo.nombre ?? "",
    telefono: yo.telefono ?? "",
    email: yo.email ?? "—",
    rol: yo.rol,
    rolTexto: ROL[yo.rol] ?? yo.rol,
    empresa: yo.empresa ?? "Sin empresa",
    tieneClave: yo.tiene_clave,
  };
}
