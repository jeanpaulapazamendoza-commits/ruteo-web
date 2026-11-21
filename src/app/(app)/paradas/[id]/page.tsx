import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { fichaParada, historialParada, itemsDeParada, miRol } from "@/app/acciones/datos";
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

  const [parada, historial, items, rol] = await Promise.all([
    fichaParada(id),
    historialParada(id),
    itemsDeParada(id),
    miRol(),
  ]);

  if (!parada) notFound();

  // Sin `BarraSuperior`: la ficha lleva su propia cabecera —«Órdenes > #código»
  // con las acciones a la derecha—, como en la referencia.
  return <FichaParada parada={parada} historial={historial} items={items} rol={rol} />;
}
