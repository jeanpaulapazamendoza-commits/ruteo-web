import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import NavLateral from "@/components/NavLateral";

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

  // RLS garantiza que solo se lea el perfil de la propia empresa.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, rol, organizaciones(nombre)")
    .eq("id", user.id)
    .maybeSingle();

  const empresa =
    (perfil?.organizaciones as { nombre?: string } | null)?.nombre ??
    "Sin empresa";

  return (
    <div className="flex h-screen overflow-hidden">
      <NavLateral
        nombre={perfil?.nombre ?? user.email ?? "Usuario"}
        empresa={empresa}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-surface-2">
        {children}
      </div>
    </div>
  );
}
