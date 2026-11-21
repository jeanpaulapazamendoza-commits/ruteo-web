import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { estadoFlota, eventosDelDia } from "@/app/acciones/datos";
import PanelActividadNueva from "@/components/PanelActividadNueva";

/**
 * Actividad, en el diseño nuevo de la referencia.
 *
 * Allí conviven las dos: «Actividad», la de siempre, y «Nueva Actividad»,
 * que muestra lo mismo con indicadores en tarjeta y cada vehículo como una
 * fila de celdas. Los datos salen de las mismas dos consultas que la otra.
 */
export default async function PaginaActividadNueva({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { fecha } = await searchParams;
  // Lo que llega de la barra de direcciones acaba en un `::date` de Postgres.
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;

  const [rutas, eventos] = await Promise.all([
    estadoFlota(dia ?? undefined),
    eventosDelDia(dia ?? undefined),
  ]);

  return <PanelActividadNueva rutas={rutas} eventos={eventos} dia={dia} />;
}
