import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { fichaParada, historialParada, itemsDeParada } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import FichaParada from "@/components/FichaParada";

/**
 * La ficha de una parada.
 *
 * Antes lo que se sabía de un punto estaba repartido: la hora en la torre, la
 * foto detrás de un botón, el historial en otra tarjeta y lo que se habló de
 * él en ningún sitio. Cuando un cliente reclama, hay que poder abrir una
 * dirección y verlo todo junto.
 */
export default async function PaginaParada({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const [parada, historial, items] = await Promise.all([
    fichaParada(id),
    historialParada(id),
    itemsDeParada(id),
  ]);

  if (!parada) notFound();

  return (
    <>
      <BarraSuperior
        migaja={
          <Link
            href={`/torre?despacho=${parada.despacho_id}`}
            className="transition hover:text-ink"
          >
            ← {parada.despacho ?? "Despacho"}
          </Link>
        }
        titulo={parada.nombre ?? "Parada"}
        acciones={
          <Link
            href={`/despachos/${parada.despacho_id}`}
            className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
          >
            Ver planificación
          </Link>
        }
      />
      <FichaParada parada={parada} historial={historial} items={items} />
    </>
  );
}
