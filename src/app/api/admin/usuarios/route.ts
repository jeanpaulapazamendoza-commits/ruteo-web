import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";

/**
 * Alta de un usuario del equipo. Solo un admin puede llamarlo.
 *
 * El alta la hace `crear_usuario` en la base: perfil y credencial en una sola
 * transacción, con la contraseña cifrada dentro de Postgres —nunca sale de
 * ahí en claro ni vuelve al servidor.
 *
 * La llamada va con la identidad del admin, y la función toma la empresa de
 * `private.mi_org()` y no del cuerpo de la petición: así un admin no puede
 * colar a alguien en otra empresa aunque manipule la llamada.
 */
const ROLES = new Set(["admin", "planificador", "conductor"]);

export async function POST(peticion: Request) {
  const sesion = await auth();
  if (!sesion?.user) return Response.json({ detail: "No autenticado." }, { status: 401 });

  let cuerpo: { nombre?: string; email?: string; rol?: string; password?: string };
  try {
    cuerpo = await peticion.json();
  } catch {
    return Response.json({ detail: "Cuerpo inválido." }, { status: 400 });
  }

  const nombre = (cuerpo.nombre ?? "").trim();
  const email = (cuerpo.email ?? "").trim().toLowerCase();
  const rol = (cuerpo.rol ?? "conductor").trim();
  const password = cuerpo.password ?? "";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ detail: "Correo inválido." }, { status: 400 });
  }
  if (!ROLES.has(rol)) {
    return Response.json({ detail: "Rol no permitido." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json(
      { detail: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }

  try {
    const filas = await comoUsuario<{ crear_usuario: string }>(
      sesion.user.id,
      "select public.crear_usuario($1, $2, $3, $4) as crear_usuario",
      [nombre || email.split("@")[0], email, rol, password],
    );
    return Response.json({ ok: true, id: filas[0]?.crear_usuario, email });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    if (/Solo un administrador/i.test(mensaje)) {
      return Response.json({ detail: mensaje }, { status: 403 });
    }
    const duplicado = /ya tiene una cuenta/i.test(mensaje);
    return Response.json({ detail: mensaje }, { status: duplicado ? 409 : 400 });
  }
}
