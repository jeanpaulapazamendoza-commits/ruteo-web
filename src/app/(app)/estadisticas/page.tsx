import { redirect } from "next/navigation";
import { auth } from "@/auth";
import PanelEstadisticas from "@/components/PanelEstadisticas";

/**
 * Los informes.
 *
 * Las otras pantallas miran el día de hoy; esta mira hacia atrás, que es de
 * donde salen las decisiones que no son urgentes: qué cliente falla siempre,
 * a qué hora se para el reparto, qué artículo vuelve al almacén.
 *
 * Todo se calcula al preguntarlo. No hay proceso nocturno ni tabla de
 * resumen, porque un número guardado se queda viejo en silencio.
 */
export default async function PaginaEstadisticas() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // Sin `BarraSuperior`: el panel pinta su propio título, porque debajo va
  // la barra de pestañas y las dos piezas se miden juntas.
  return <PanelEstadisticas />;
}
