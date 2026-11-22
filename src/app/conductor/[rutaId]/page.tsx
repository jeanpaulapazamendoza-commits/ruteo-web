import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import RutaReparto, { type ParadaReparto } from "@/components/RutaReparto";
import { asegurarTrazados } from "@/lib/trazado";

type Cabecera = {
  id: string;
  indice: number;
  km: number | null;
  salida_prog: string | null;
  salida_real: string | null;
  geometria: number[][] | null;
  despacho: string | null;
  fecha: string;
  cd_lat: number | null;
  cd_lon: number | null;
};

export default async function PaginaRutaConductor({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ rutaId: string }>;
}) {
  const { rutaId } = await params;
  const sesion = await auth();
  const id = sesion!.user.id;

  await asegurarTrazados(id, { ruta: rutaId });

  const ruta = await unaFila<Cabecera>(
    id,
    `select r.id, r.indice, r.km, r.salida_prog, r.salida_real, r.geometria,
            d.nombre as despacho, d.fecha, d.cd_lat, d.cd_lon
       from rutas r
       join despachos d on d.id = r.despacho_id
      where r.id = $1`,
    [rutaId],
  );

  // Si el RLS lo ocultó (no es su ruta), para el conductor sencillamente no existe.
  if (!ruta) notFound();

  const paradas = await comoUsuario<ParadaReparto>(
    id,
    `select id, orden, codigo, nombre, distrito, lat, lon, bultos, prioridad,
            eta, ventana_ini, ventana_fin, estado_entrega, hora_entrega,
            motivo, bultos_entregados, observaciones, recibe
       from paradas where ruta_id = $1 order by orden`,
    [rutaId],
  );

  return (
    <RutaReparto
      rutaId={ruta.id}
      indice={ruta.indice}
      despacho={ruta.despacho ?? "Despacho"}
      fecha={ruta.fecha}
      cd={
        ruta.cd_lat != null && ruta.cd_lon != null
          ? { lat: ruta.cd_lat, lon: ruta.cd_lon }
          : null
      }
      salidaProg={ruta.salida_prog}
      salidaReal={ruta.salida_real}
      km={ruta.km}
      geometria={ruta.geometria}
      paradas={paradas}
      orgId={sesion!.user.orgId ?? ""}
    />
  );
}
