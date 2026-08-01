import { createClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Alta de una empresa cliente con su primer administrador.
 *
 * Solo el desarrollador. Necesita la clave de servicio porque crea una cuenta
 * de acceso, y esa clave no puede pisar el navegador: por eso vive aquí.
 *
 * Si la creación del usuario falla, la empresa recién creada se deshace: una
 * empresa sin administrador no la puede arreglar nadie desde la aplicación.
 */
export async function POST(peticion: Request) {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ detail: "No autenticado." }, { status: 401 });

  const { data: yo } = await supabase
    .from("perfiles")
    .select("es_desarrollador")
    .eq("id", user.id)
    .maybeSingle();

  if (!yo?.es_desarrollador) {
    return Response.json(
      { detail: "Solo el desarrollador puede dar de alta empresas." },
      { status: 403 },
    );
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
  if (password.length < 6) {
    return Response.json({ detail: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, clave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: org, error: errOrg } = await admin
    .from("organizaciones")
    .insert({ nombre: empresa })
    .select("id")
    .single();

  if (errOrg) return Response.json({ detail: errOrg.message }, { status: 400 });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: nombre || email.split("@")[0], org_id: org.id, rol: "admin" },
  });

  if (error) {
    // Sin administrador la empresa nace inservible: se deshace el alta.
    await admin.from("organizaciones").delete().eq("id", org.id);
    const dup = /already been registered|already exists/i.test(error.message);
    return Response.json(
      { detail: dup ? "Ese correo ya tiene una cuenta." : error.message },
      { status: dup ? 409 : 400 },
    );
  }

  return Response.json({ ok: true, org_id: org.id, admin_id: data.user?.id, email });
}
