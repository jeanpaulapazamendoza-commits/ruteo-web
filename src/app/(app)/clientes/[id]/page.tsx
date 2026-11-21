import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { fichaCliente, historialCliente } from "@/app/acciones/clientes";
import { miRol } from "@/app/acciones/datos";
import FichaCliente from "@/components/FichaCliente";

export default async function PaginaCliente({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const [cliente, historial, rol] = await Promise.all([
    fichaCliente(id),
    historialCliente(id),
    miRol(),
  ]);

  if (!cliente) notFound();

  // Sin `BarraSuperior`: la ficha pinta su propia cabecera, con la flecha de
  // vuelta, como en la referencia.
  return (
    <FichaCliente cliente={cliente} historial={historial} editable={rol !== "conductor"} />
  );
}
