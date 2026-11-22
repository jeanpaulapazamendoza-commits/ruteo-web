import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { etiquetas } from "@/app/acciones/etiquetas";
import Etiquetas from "@/components/Etiquetas";

export const metadata = { title: "Etiquetas · PuriqGo" };

/**
 * Las etiquetas de impresión de unas rutas o de unas órdenes.
 *
 * Va fuera del armazón de la aplicación —sin barra ni carril— porque es una
 * hoja para la impresora: lo que se ve es lo que sale.
 *
 * `?rutas=id,id` imprime todas las órdenes de esas rutas, en orden de
 * reparto; `?paradas=id,id`, esas órdenes.
 */
export default async function PaginaEtiquetas({
  searchParams,
}: {
  searchParams: Promise<{ rutas?: string; paradas?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const q = await searchParams;
  const lista = await etiquetas({
    rutas: q.rutas?.split(",") ?? [],
    paradas: q.paradas?.split(",") ?? [],
  });

  return <Etiquetas etiquetas={lista} />;
}
