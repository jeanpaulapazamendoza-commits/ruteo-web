import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { unaFila } from "@/lib/db";
import CuentaBloqueada from "@/components/CuentaBloqueada";

/**
 * La app de reparto va en el móvil del conductor: nada de barra lateral de
 * escritorio, todo a ancho completo y con los botones grandes.
 */
export default async function LayoutConductor({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const perfil = await unaFila<{ activo: boolean }>(
    sesion.user.id,
    "select activo from perfiles where id = $1",
    [sesion.user.id],
  );

  if (!perfil || perfil.activo === false) {
    return <CuentaBloqueada email={sesion.user.email ?? ""} sinPerfil={!perfil} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* La cabecera la pone cada pantalla: la de la lista y la de una ruta
          no son la misma, y el relleno inferior depende de la consola. */}
      <main className="mx-auto w-full max-w-[560px] flex-1">{children}</main>
    </div>
  );
}
