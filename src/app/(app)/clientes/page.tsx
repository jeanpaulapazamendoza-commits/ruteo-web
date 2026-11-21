import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { clientes } from "@/app/acciones/clientes";
import { BarraSuperior } from "@/components/ui";
import PanelClientes from "@/components/PanelClientes";

/**
 * La cartera de clientes.
 *
 * Hasta ahora el destinatario solo existía dentro del despacho del día. Aquí
 * es una entidad con su historia: cuántas veces se le fue, cuántas se le
 * falló, cuándo fue la última y a qué número se llama cuando no abre.
 */
export default async function PaginaClientes() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const lista = await clientes();

  return (
    <>
      <BarraSuperior
        migaja="Cartera"
        titulo="Clientes"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{lista.length}</b> clientes
          </span>
        }
      />
      <PanelClientes clientes={lista} />
    </>
  );
}
