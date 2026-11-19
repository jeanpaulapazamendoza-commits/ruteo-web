import { auth } from "@/auth";
import { comoServicio, unaFila } from "@/lib/db";

/**
 * Alta de una empresa cliente con su primer administrador.
 *
 * Solo el desarrollador. El alta la hace `registrar_empresa` en una sola
 * transacción —empresa, perfil y credencial—, así que ya no hay que deshacer
 * nada a mano si el usuario falla después de crear la empresa.
 *
 * Esa función está revocada al rol `authenticated` (crea cuentas de acceso),
 * de ahí `comoServicio`: antes se comprueba aquí quién llama, porque esa vía
 * no pasa por el RLS.
 */
export async function POST(peticion: Request) {
  const sesion = await auth();
  if (!sesion?.user) return Response.json({ detail: "No autenticado." }, { status: 401 });

  const yo = await unaFila<{ es_desarrollador: boolean }>(
    sesion.user.id,
    "select es_desarrollador from perfiles where id = $1",
    [sesion.user.id],
  );

  if (!yo?.es_desarrollador) {
    return Response.json(
      { detail: "Solo el desarrollador puede dar de alta empresas." },
      { status: 403 },
    );
  }

  let cuerpo: { empresa?: string; nombre?: string; email?: string; password?: string };
  try {
    cuerpo = await peticion.json();
  } catch {
    return Response.json({ detail: "Cuerpo inválido." }, { status: 400 });
  }

  const empresa = (cuerpo.empresa ?? "").trim();
  const nombre = (cuerpo.nombre ?? "").trim();
  const email = (cuerpo.email ?? "").trim().toLowerCase();
  const password = cuerpo.password ?? "";

  if (!empresa) return Response.json({ detail: "Falta el nombre de la empresa." }, { status: 400 });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ detail: "Correo inválido." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json(
      { detail: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 },
    );
  }

  try {
    const filas = await comoServicio<{ registrar_empresa: string }>(
      "select public.registrar_empresa($1, $2, $3, $4) as registrar_empresa",
      [empresa, nombre || email.split("@")[0], email, password],
    );
    return Response.json({ ok: true, admin_id: filas[0]?.registrar_empresa, email });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    const duplicado = /ya tiene una cuenta/i.test(mensaje);
    return Response.json({ detail: mensaje }, { status: duplicado ? 409 : 400 });
  }
}
