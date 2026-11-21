import MarcoAjustes from "@/components/MarcoAjustes";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { bitacora } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import PanelBitacora from "@/components/PanelBitacora";

/**
 * Qué se ha cambiado y quién lo cambió.
 *
 * El registro de eventos cuenta lo que pasó en la calle; esto cuenta lo que
 * se tocó desde dentro. Son preguntas distintas: una es «¿a qué hora entregó?»
 * y la otra «¿quién le cambió el conductor a esta ruta a las once?».
 */
export default async function PaginaBitacora() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const lista = await bitacora();

  return (
    <MarcoAjustes>
      <BarraSuperior
        migaja="Administración"
        titulo="Bitácora"
        acciones={
          <span className="text-[12px] text-ink-2">
            últimos <b className="num text-ink">300</b> cambios
          </span>
        }
      />
      <PanelBitacora inicial={lista} />
    </MarcoAjustes>
  );
}
