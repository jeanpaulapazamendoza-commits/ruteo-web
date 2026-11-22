import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { miCuenta } from "@/lib/miCuenta";
import { BarraSuperior } from "@/components/ui";
import CambiarClave from "@/components/CambiarClave";
import MiPerfil from "@/components/MiPerfil";

/**
 * Mi cuenta, para el conductor.
 *
 * Vive fuera del grupo `(app)` a propósito: ese layout manda al conductor a
 * su app de reparto, y el conductor es justo quien más va a necesitar esta
 * pantalla. Sin barra lateral, con una vuelta atrás a sus rutas.
 *
 * En la oficina la misma pantalla está dentro de la configuración, en
 * `/perfil`: quien no es conductor se va allí.
 */
export default async function PaginaCuenta() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const yo = await miCuenta(sesion.user.id);
  if (!yo) redirect("/login");
  if (yo.rol !== "conductor") redirect("/perfil");

  return (
    <div className="min-h-full bg-surface-2">
      <BarraSuperior
        migaja={
          <Link href="/conductor" className="transition hover:text-ink">
            ← Volver a mis rutas
          </Link>
        }
        titulo="Mi cuenta"
      />

      <div className="flex flex-col gap-4 p-4">
        <MiPerfil nombre={yo.nombre} telefono={yo.telefono} email={yo.email} rol={yo.rolTexto} empresa={yo.empresa} />
        <CambiarClave tieneClave={yo.tieneClave} />
      </div>
    </div>
  );
}
