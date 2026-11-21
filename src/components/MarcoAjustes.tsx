import type { ReactNode } from "react";
import { auth } from "@/auth";
import MenuAjustes from "@/components/MenuAjustes";

/**
 * El marco de las pantallas de configuración.
 *
 * A la izquierda el menú de ajustes; a la derecha la pantalla, que se pinta
 * igual que cualquier otra: un título sobre el lienzo y su panel blanco. Por
 * eso la columna derecha vuelve a ser un `lienzo`: las reglas del panel se
 * aplican a lo que cuelga de ella, y ninguna pantalla de ajustes tiene que
 * saber que está dentro de un marco.
 */
export default async function MarcoAjustes({ children }: { children: ReactNode }) {
  const sesion = await auth();

  return (
    <div className="sin-panel @container flex min-h-0 flex-1">
      <MenuAjustes
        rol={sesion?.user?.rol ?? "planificador"}
        desarrollador={sesion?.user?.esDesarrollador === true}
      />
      <div className="lienzo @container flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
