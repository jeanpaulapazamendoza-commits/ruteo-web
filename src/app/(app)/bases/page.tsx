import MarcoAjustes from "@/components/MarcoAjustes";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { bases } from "@/app/acciones/bases";
import { BarraSuperior } from "@/components/ui";
import GestionBases from "@/components/GestionBases";

/** Los centros de los que sale la flota. */
export default async function PaginaBases() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const lista = await bases();

  return (
    <MarcoAjustes>
      <BarraSuperior
        migaja="Administración"
        titulo="Bases"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{lista.length}</b> guardada{lista.length === 1 ? "" : "s"}
          </span>
        }
      />
      <GestionBases lista={lista} />
    </MarcoAjustes>
  );
}
