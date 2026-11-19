import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";
import { BarraSuperior } from "@/components/ui";
import PadronEmpresas, { type ResumenOrg } from "@/components/PadronEmpresas";

export default async function PaginaOrganizaciones() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // El padrón es del desarrollador; para cualquier otro no existe.
  if (!sesion.user.esDesarrollador) redirect("/planificador");

  const empresas = await comoUsuario<ResumenOrg>(
    sesion.user.id,
    "select * from resumen_organizaciones()",
  );

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
        <PadronEmpresas empresas={empresas} />
      </div>
    </>
  );
}
