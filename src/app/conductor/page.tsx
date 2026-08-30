import { crearClienteServidor } from "@/lib/supabase/server";
import ListaRutas, { type RutaResumen } from "@/components/conductor/ListaRutas";

type RutaFila = {
  id: string;
  indice: number;
  km: number | null;
  salida_prog: string | null;
  salida_real: string | null;
  estado: string;
  despachos: { nombre: string | null; fecha: string; cd_lat: number | null; cd_lon: number | null } | null;
  paradas: { estado_entrega: string; bultos: number }[];
};

export default async function PaginaConductor() {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El RLS ya limita a las rutas del conductor; el filtro explícito deja
  // claro qué se pide y sirve también a un admin que quiera echar un vistazo.
  const [{ data }, { data: perfil }] = await Promise.all([
    supabase
      .from("rutas")
      .select(
        `id, indice, km, salida_prog, salida_real, estado,
         despachos(nombre, fecha, cd_lat, cd_lon),
         paradas(estado_entrega, bultos)`,
      )
      .eq("conductor_id", user?.id ?? "")
      .eq("sin_asignar", false)
      .order("indice"),
    supabase.from("perfiles").select("nombre").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  // Una ruta pendiente se muestra siempre, tenga la fecha que tenga: un
  // reparto atrasado sigue siendo trabajo por hacer. Solo las ya terminadas
  // dejan de estorbar a los dos días.
  const rutas: RutaResumen[] = ((data ?? []) as unknown as RutaFila[])
    .filter((r) => {
      const terminada = r.estado === "completada" || r.estado === "cancelada";
      return !terminada || (r.despachos?.fecha ?? "") >= hoyMenos(2);
    })
    .map((r) => ({
      id: r.id,
      etiqueta: `R-${String(r.indice + 1).padStart(2, "0")}`,
      despacho: r.despachos?.nombre ?? "Despacho",
      fecha: r.despachos?.fecha ?? "",
      total: r.paradas.length,
      cerradas: r.paradas.filter((p) => p.estado_entrega !== "pendiente").length,
      bultos: r.paradas.reduce((a, p) => a + (p.bultos ?? 0), 0),
      km: r.km,
      salidaReal: r.salida_real,
    }));

  return (
    <ListaRutas nombre={perfil?.nombre ?? user?.email ?? "Conductor"} rutas={rutas} />
  );
}

/** Las rutas de días anteriores dejan de estorbar en la pantalla del móvil. */
function hoyMenos(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
