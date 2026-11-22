import MarcoAjustes from "@/components/MarcoAjustes";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { miRol } from "@/app/acciones/datos";
import { conductoresActivos, vehiculosLista } from "@/app/acciones/vehiculos";
import { BarraSuperior } from "@/components/ui";
import GestionVehiculos from "@/components/GestionVehiculos";

/** La flota: los vehículos que se asignan a las rutas. */
export default async function PaginaVehiculos() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const [lista, conductores, rol] = await Promise.all([
    vehiculosLista(),
    conductoresActivos(),
    miRol(),
  ]);

  return (
    <MarcoAjustes>
      <BarraSuperior
        migaja="Administración"
        titulo="Vehículos"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{lista.filter((v) => v.activo).length}</b> activos
          </span>
        }
      />
      <GestionVehiculos lista={lista} conductores={conductores} puedeEditar={rol !== "conductor"} />
    </MarcoAjustes>
  );
}
