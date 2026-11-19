import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";
import { BarraSuperior } from "@/components/ui";
import GestionEquipo, { type MiembroEquipo } from "@/components/GestionEquipo";

export default async function PaginaEquipo() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // Solo administradores. El RLS ya limita qué puede tocar, pero se corta
  // aquí para no mostrar la pantalla a quien no debe verla.
  if (sesion.user.rol !== "admin") redirect("/planificador");

  // Sin el nombre de la empresa delante, en una plataforma con varias
  // organizaciones no se sabe a qué equipo se le está tocando el rol.
  const empresa = sesion.user.empresa ?? "tu empresa";

  const miembros = await comoUsuario<MiembroEquipo>(
    sesion.user.id,
    `select id, nombre, email, rol, activo, creado_en
       from perfiles order by creado_en`,
  );

  return (
    <>
      <BarraSuperior
        migaja="Administración"
        titulo={`Equipo de ${empresa}`}
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{miembros.filter((m) => m.activo).length}</b> activos
            {" · "}
            <b className="num text-ink">{miembros.filter((m) => m.rol === "conductor").length}</b> conductores
          </span>
        }
      />
      <div className="p-4">
        <GestionEquipo miembros={miembros} miId={sesion.user.id} />
      </div>
    </>
  );
}
