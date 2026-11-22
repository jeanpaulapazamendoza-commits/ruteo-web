import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { estadoFlota, eventosDelDia, pendientesDelDia } from "@/app/acciones/datos";
import PanelActividad from "@/components/PanelActividad";

/**
 * El turno entero en una pantalla.
 *
 * La torre sigue un despacho y Flota un conductor; esta mira todas las rutas
 * del día a la vez, que es como se trabaja cuando hay cuatro archivos
 * distintos en la calle. Una tarjeta por vehículo, con sus números y su día
 * dibujado en una franja horaria común a todas, para poder compararlas.
 */
export default async function PaginaActividad({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { fecha } = await searchParams;
  // Lo que llega de la barra de direcciones acaba en un `::date` de Postgres.
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;

  const [rutas, eventos, pendientes] = await Promise.all([
    estadoFlota(dia ?? undefined),
    eventosDelDia(dia ?? undefined),
    pendientesDelDia(dia ?? undefined),
  ]);

  // Sin `BarraSuperior`: en la referencia esta pantalla lleva su propio
  // encabezado —«N Vehículos en ruta»— y lo pinta el panel.
  return <PanelActividad rutas={rutas} eventos={eventos} pendientes={pendientes} dia={dia} />;
}
