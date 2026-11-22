import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { estadoFlota } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import PanelFlota, { type VehiculoFlota } from "@/components/PanelFlota";
import { comoUsuario } from "@/lib/db";

/**
 * Dónde están los conductores y cómo van.
 *
 * No hay rastreo continuo ni hace falta: todo lo que se muestra sale de lo
 * que el móvil ya registra al marcar cada parada. La posición es la de la
 * última marca, el silencio se mide desde el último evento, y el desvío
 * compara la hora real con la que calculó el planificador.
 */
export default async function PaginaFlota({
  searchParams,
}: {
  // En Next 16 searchParams llega como promesa.
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { fecha } = await searchParams;
  // Solo se acepta una fecha con forma de fecha: lo que llega de la barra de
  // direcciones va a parar a un `::date` de Postgres.
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;

  // Los vehículos de la empresa: los que hoy no tienen ruta son los
  // «disponibles», y los retirados, los «no disponibles».
  const [rutas, vehiculos] = await Promise.all([
    estadoFlota(dia ?? undefined),
    comoUsuario<VehiculoFlota>(
      sesion.user.id,
      `select v.id, v.nombre, v.placa, c.nombre as conductor, v.grupo, v.activo
         from vehiculos v left join perfiles c on c.id = v.conductor_id
        order by v.nombre`,
    ),
  ]);

  return (
    <>
      <BarraSuperior migaja="" titulo="Flota" />
      <PanelFlota inicial={rutas} vehiculos={vehiculos} dia={dia} />
    </>
  );
}
