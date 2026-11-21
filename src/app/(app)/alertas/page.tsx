import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { alertas } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import PanelAlertas from "@/components/PanelAlertas";

/**
 * Lo que requiere una decisión, en un solo sitio.
 *
 * La torre muestra el avance de un despacho y Flota el estado de cada
 * conductor; las dos hay que mirarlas. Esta pantalla es la que avisa sola:
 * reúne lo que va mal en todas las rutas del día.
 */
export default async function PaginaAlertas({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { fecha } = await searchParams;
  // Lo que llega de la barra de direcciones acaba en un `::date` de Postgres.
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;

  const lista = await alertas(dia ?? undefined);
  const pendientes = lista.filter((a) => !a.atendida).length;

  return (
    <>
      <BarraSuperior migaja="" titulo="Alertas" />
      <PanelAlertas inicial={lista} dia={dia} />
    </>
  );
}
