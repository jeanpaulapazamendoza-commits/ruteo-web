import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior } from "@/components/ui";
import GestionEquipo, { type MiembroEquipo } from "@/components/GestionEquipo";

export default async function PaginaEquipo() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Solo administradores. RLS ya limita, pero cortamos aquí para no
  // mostrar la pantalla a quien no debe verla.
  const { data: yo } = await supabase
    .from("perfiles")
    .select("rol, organizaciones(nombre)")
    .eq("id", user.id)
    .maybeSingle();
  if (yo?.rol !== "admin") redirect("/planificador");

  // Sin el nombre de la empresa delante, en una plataforma con varias
  // organizaciones no se sabe a qué equipo se le está tocando el rol.
  const empresa = (yo.organizaciones as { nombre?: string } | null)?.nombre ?? "tu empresa";

  const { data: equipo } = await supabase
    .from("perfiles")
    .select("id, nombre, email, rol, activo, creado_en")
    .order("creado_en", { ascending: true });

  const miembros = (equipo ?? []) as MiembroEquipo[];

  return (
    <>
      <BarraSuperior
        migaja="Administración"
        titulo={`Equipo de ${empresa}`}
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{miembros.filter((m) => m.activo).length}</b> activos
            {" · "}
            <b className="num text-ink">{miembros.filter((m) => m.rol === "conductor").length}</b> conductores
          </span>
        }
      />
      <div className="p-4">
        <GestionEquipo miembros={miembros} miId={user.id} />
      </div>
    </>
  );
}
