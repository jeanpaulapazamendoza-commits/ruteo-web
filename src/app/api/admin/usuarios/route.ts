import { createClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Alta de un usuario del equipo. Solo un admin puede llamarlo.
 *
 * Crear cuentas requiere la clave de servicio (`service_role`), que NUNCA
 * puede estar en el navegador: por eso vive en este endpoint de servidor.
 * La empresa del nuevo usuario se toma del admin autenticado, jamás del
 * cuerpo de la petición: así un admin no puede colar a alguien en otra empresa.
 */
const ROLES = new Set(["admin", "planificador", "conductor"]);

export async function POST(peticion: Request) {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ detail: "No autenticado." }, { status: 401 });

  // El propio perfil se lee siempre; confirmamos que es admin y su empresa.
  const { data: yo } = await supabase
    .from("perfiles")
    .select("org_id, rol")
    .eq("id", user.id)
    .maybeSingle();
  if (yo?.rol !== "admin") {
    return Response.json({ detail: "Solo un administrador puede crear usuarios." }, { status: 403 });
  }

  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) {
    return Response.json(
      {
        detail:
          "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor. " +
          "Cópiala del panel de Supabase (Settings → API) a las variables de Vercel y a .env.local.",
      },
      { status: 501 },
    );
  }

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
  if (password.length < 6) {
    return Response.json({ detail: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Crear el usuario ya confirmado (sin correo) y con la empresa del admin.
  // El trigger `alta_usuario` crea el perfil leyendo estos metadatos.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: nombre || email.split("@")[0], org_id: yo.org_id, rol },
  });

  if (error) {
    const dup = /already been registered|already exists/i.test(error.message);
    return Response.json(
      { detail: dup ? "Ese correo ya tiene una cuenta." : error.message },
      { status: dup ? 409 : 400 },
    );
  }

  return Response.json({ ok: true, id: data.user?.id, email });
}
