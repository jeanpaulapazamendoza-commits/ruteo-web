import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { miCuenta } from "@/lib/miCuenta";
import { BarraSuperior } from "@/components/ui";
import CambiarClave from "@/components/CambiarClave";
import MarcoAjustes from "@/components/MarcoAjustes";
import MiPerfil from "@/components/MiPerfil";

/**
 * Mi perfil, dentro de la configuración.
 *
 * Antes «Mi cuenta» era una página suelta, sin el carril ni el menú: se
 * entraba y había que volver atrás para seguir trabajando. El conductor
 * conserva la suya (`/cuenta`), porque este armazón es el de la oficina.
 */
export default async function PaginaPerfil() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const yo = await miCuenta(sesion.user.id);
  if (!yo) redirect("/login");

  return (
    <MarcoAjustes>
      <BarraSuperior migaja="" titulo="Mi perfil" />
      <div>
        <div className="flex flex-col gap-4 pb-1">
          <MiPerfil nombre={yo.nombre} email={yo.email} rol={yo.rolTexto} empresa={yo.empresa} />
          <CambiarClave tieneClave={yo.tieneClave} />
        </div>
      </div>
    </MarcoAjustes>
  );
}
