import Link from "next/link";
import { notFound } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import RutaReparto, { type ParadaReparto } from "@/components/RutaReparto";

export default async function PaginaRutaConductor({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ rutaId: string }>;
}) {
  const { rutaId } = await params;
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: ruta }, { data: perfil }] = await Promise.all([
    supabase
      .from("rutas")
      .select(
        `id, indice, km, duracion_min, salida_prog, salida_real, estado, geometria,
         despachos(nombre, fecha, cd_lat, cd_lon),
         paradas(id, orden, codigo, nombre, distrito, lat, lon, bultos, prioridad,
                 eta, ventana_ini, ventana_fin, estado_entrega, hora_entrega,
                 motivo, bultos_entregados, observaciones, recibe)`,
      )
      .eq("id", rutaId)
      .maybeSingle(),
    supabase.from("perfiles").select("org_id").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  // Si el RLS lo ocultó (no es su ruta), para el conductor sencillamente no existe.
  if (!ruta) notFound();

  const cab = ruta.despachos as unknown as {
    nombre: string | null;
    fecha: string;
    cd_lat: number | null;
    cd_lon: number | null;
  } | null;

  const paradas = [...((ruta.paradas ?? []) as unknown as ParadaReparto[])].sort(
    (a, b) => a.orden - b.orden,
  );

  return (
    <>
      <Link
        href="/conductor"
        className="mb-2 inline-block px-1 text-[13px] font-semibold text-ink-2"
      >
        ← Tus rutas
      </Link>

      <RutaReparto
        rutaId={ruta.id}
        indice={ruta.indice}
        despacho={cab?.nombre ?? "Despacho"}
        fecha={cab?.fecha ?? ""}
        cd={
          cab?.cd_lat != null && cab?.cd_lon != null
            ? { lat: cab.cd_lat, lon: cab.cd_lon }
            : null
        }
        salidaProg={ruta.salida_prog}
        salidaReal={ruta.salida_real}
        km={ruta.km}
        geometria={(ruta.geometria as number[][] | null) ?? null}
        paradas={paradas}
        orgId={perfil?.org_id ?? ""}
      />
    </>
  );
}
