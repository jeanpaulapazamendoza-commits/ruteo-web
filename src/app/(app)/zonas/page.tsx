import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraSuperior } from "@/components/ui";
import EditorZonas from "@/components/EditorZonas";
import type { Zona } from "@/lib/zonas";

export default async function PaginaZonas() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: filas }, { data: perfil }] = await Promise.all([
    supabase
      .from("zonas")
      .select("id, nombre, color, poligono")
      .eq("activo", true)
      .order("nombre"),
    supabase.from("perfiles").select("org_id").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  const zonas: Zona[] = (filas ?? []).map((z) => ({
    id: z.id,
    nombre: z.nombre,
    color: z.color,
    poligono: z.poligono as Zona["poligono"],
  }));

  return (
    <>
      <BarraSuperior
        migaja="Datos"
        titulo="Zonas de reparto"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{zonas.length}</b> zonas guardadas
          </span>
        }
      />
      <EditorZonas zonas={zonas} orgId={perfil?.org_id ?? null} miId={user?.id ?? null} />
    </>
  );
}
