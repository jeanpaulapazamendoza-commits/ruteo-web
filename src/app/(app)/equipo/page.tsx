import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";
import { BarraSuperior } from "@/components/ui";
import MarcoAjustes from "@/components/MarcoAjustes";
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

  const activos = miembros.filter((m) => m.activo).length;

  // «Equipo de {empresa}» pasa a la miga: el título es el de la referencia.
  return (
    <MarcoAjustes>
      <BarraSuperior
        migaja=""
        titulo="Usuarios"
        acciones={
          <span className="mr-auto pl-3 text-[13px] text-ink-3">
            {empresa} · Usuarios activos: <b className="num text-ink-2">{activos}</b>
            {" · "}Usuarios bloqueados:{" "}
            <b className="num text-ink-2">{miembros.length - activos}</b>
          </span>
        }
      />
      <GestionEquipo miembros={miembros} miId={sesion.user.id} />
    </MarcoAjustes>
  );
}
