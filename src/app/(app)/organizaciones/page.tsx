import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior } from "@/components/ui";
import PadronEmpresas, { type ResumenOrg } from "@/components/PadronEmpresas";

export default async function PaginaOrganizaciones() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: yo } = await supabase
    .from("perfiles")
    .select("es_desarrollador")
    .eq("id", user.id)
    .maybeSingle();

  // El padrón es del desarrollador; para cualquier otro no existe.
  if (!yo?.es_desarrollador) redirect("/planificador");

  const { data, error } = await supabase.rpc("resumen_organizaciones");
  const empresas = (data ?? []) as ResumenOrg[];

  const activas = empresas.filter((e) => e.activa).length;

  return (
    <>
      <BarraSuperior
        migaja="Desarrollador"
        titulo="Empresas"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{activas}</b> activas de{" "}
            <b className="num text-ink">{empresas.length}</b>
          </span>
        }
      />
      <div className="p-4">
        {error && (
          <p className="mb-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">
            {error.message}
          </p>
        )}
        <PadronEmpresas empresas={empresas} />
      </div>
    </>
  );
}
