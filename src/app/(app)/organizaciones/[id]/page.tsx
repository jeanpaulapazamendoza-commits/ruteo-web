import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior, Tarjeta, Pastilla } from "@/components/ui";
import FichaEmpresa, { type DetalleOrg } from "@/components/FichaEmpresa";

export default async function PaginaEmpresa({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  if (!yo?.es_desarrollador) redirect("/planificador");

  const { data, error } = await supabase.rpc("detalle_organizacion", { p_org: id });
  const detalle = data as DetalleOrg | null;

  if (error) {
    return (
      <>
        <BarraSuperior migaja="Desarrollador" titulo="Empresa" />
        <div className="p-4">
          <Tarjeta className="p-4 text-[13px] text-bad">{error.message}</Tarjeta>
        </div>
      </>
    );
  }

  if (!detalle?.empresa) notFound();

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/organizaciones" className="transition hover:text-ink">
            ← Empresas
          </Link>
        }
        titulo={detalle.empresa.nombre}
        acciones={
          <Pastilla tono={detalle.empresa.activa ? "ok" : "bad"}>
            {detalle.empresa.activa ? "Activa" : "Suspendida"}
          </Pastilla>
        }
      />
      <div className="p-4">
        <FichaEmpresa detalle={detalle} />
      </div>
    </>
  );
}
