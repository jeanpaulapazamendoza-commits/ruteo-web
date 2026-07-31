import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import NavLateral from "@/components/NavLateral";
import CuentaBloqueada from "@/components/CuentaBloqueada";

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El usuario siempre puede leer su propio perfil (política perfiles_select),
  // aunque esté desactivado; así podemos mostrarle la pantalla de bloqueo.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, rol, activo, organizaciones(nombre)")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || perfil.activo === false) {
    return <CuentaBloqueada email={user.email ?? ""} sinPerfil={!perfil} />;
  }

  const empresa =
    (perfil.organizaciones as { nombre?: string } | null)?.nombre ??
    "Sin empresa";

  return (
    <div className="flex h-screen overflow-hidden">
      <NavLateral
        nombre={perfil.nombre ?? user.email ?? "Usuario"}
        empresa={empresa}
        rol={perfil.rol}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-surface-2">
        {children}
      </div>
    </div>
  );
}
