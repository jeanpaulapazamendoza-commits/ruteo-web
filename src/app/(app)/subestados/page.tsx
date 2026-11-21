import MarcoAjustes from "@/components/MarcoAjustes";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { subestados } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import GestionSubestados from "@/components/GestionSubestados";

/** Los motivos tipificados que cada empresa ofrece a sus conductores. */
export default async function PaginaSubestados() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // Se piden también los retirados: desde aquí se reactivan.
  const lista = await subestados(false);

  return (
    <MarcoAjustes>
      <BarraSuperior
        migaja="Administración"
        titulo="Subestados"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{lista.filter((s) => s.activo).length}</b> activos
          </span>
        }
      />
      <GestionSubestados lista={lista} />
    </MarcoAjustes>
  );
}
