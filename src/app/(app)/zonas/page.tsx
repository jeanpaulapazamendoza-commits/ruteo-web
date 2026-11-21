import MarcoAjustes from "@/components/MarcoAjustes";
import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";
import { BarraSuperior } from "@/components/ui";
import EditorZonas from "@/components/EditorZonas";
import type { Zona } from "@/lib/zonas";

export default async function PaginaZonas() {
  const sesion = await auth();
  const id = sesion!.user.id;

  const zonas = await comoUsuario<Zona>(
    id,
    "select id, nombre, color, poligono from zonas where activo order by nombre",
  );

  return (
    <MarcoAjustes>
      <BarraSuperior
        migaja="Datos"
        titulo="Zonas de reparto"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{zonas.length}</b> zonas guardadas
          </span>
        }
      />
      <EditorZonas zonas={zonas} orgId={sesion!.user.orgId} miId={id} />
    </MarcoAjustes>
  );
}
