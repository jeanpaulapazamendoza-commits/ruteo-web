import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { estadoFlota } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import PanelFlota from "@/components/PanelFlota";

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

  const rutas = await estadoFlota(dia ?? undefined);

  return (
    <>
      <BarraSuperior
        migaja="Operación"
        titulo="Flota"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{rutas.length}</b> rutas
          </span>
        }
      />
      <PanelFlota inicial={rutas} dia={dia} />
    </>
  );
}
