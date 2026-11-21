import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { fichaCliente, historialCliente } from "@/app/acciones/clientes";
import { miRol } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
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

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/clientes" className="transition hover:text-ink">
            ← Clientes
          </Link>
        }
        titulo={cliente.nombre}
        acciones={
          <span className="num text-[12px] text-ink-2">
            {cliente.codigo}
          </span>
        }
      />
      <FichaCliente
        cliente={cliente}
        historial={historial}
        editable={rol !== "conductor"}
      />
    </>
  );
}
