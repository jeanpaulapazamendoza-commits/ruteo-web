import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { conductoresConRuta, ordenes } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import PanelOrdenes from "@/components/PanelOrdenes";

/**
 * Todas las paradas, de todos los despachos, buscables.
 *
 * Hasta ahora una parada solo existía dentro de su despacho: para encontrar
 * un pedido había que acordarse de en qué archivo venía. Esta es la pantalla
 * por la que se busca cuando llama un cliente y solo dice su dirección.
 */
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export default async function PaginaOrdenes({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; texto?: string; estado?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const q = await searchParams;
  // Lo que llega de la barra de direcciones acaba en `::date` de Postgres.
  const filtro = {
    desde: q.desde && DIA.test(q.desde) ? q.desde : undefined,
    hasta: q.hasta && DIA.test(q.hasta) ? q.hasta : undefined,
    texto: q.texto?.slice(0, 80),
    estado: q.estado,
  };

  const [lista, conductores] = await Promise.all([
    ordenes(filtro),
    conductoresConRuta(filtro.desde, filtro.hasta),
  ]);

  return (
    <>
      <BarraSuperior
        migaja="Operación"
        titulo="Órdenes"
        acciones={
          <span className="text-[12px] text-ink-2">
            últimos <b className="num text-ink">8</b> días por defecto
          </span>
        }
      />
      <PanelOrdenes inicial={lista} conductores={conductores} filtro={filtro} />
    </>
  );
}
