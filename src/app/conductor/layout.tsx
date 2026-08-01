import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import CuentaBloqueada from "@/components/CuentaBloqueada";
import BarraConductor from "@/components/BarraConductor";

/**
 * La app de reparto va en el móvil del conductor: nada de barra lateral de
 * escritorio, todo a ancho completo y con los botones grandes.
 */
export default async function LayoutConductor({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, rol, activo, org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || perfil.activo === false) {
    return <CuentaBloqueada email={user.email ?? ""} sinPerfil={!perfil} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <BarraConductor nombre={perfil.nombre ?? user.email ?? "Conductor"} />
      <main className="mx-auto w-full max-w-[560px] flex-1 px-3 pb-24 pt-3">{children}</main>
    </div>
  );
}
