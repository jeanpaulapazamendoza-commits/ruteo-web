import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";
import ListaRutas, { type RutaResumen } from "@/components/conductor/ListaRutas";

type Fila = {
  id: string;
  indice: number;
  km: number | null;
  salida_real: string | null;
  estado: string;
  despacho: string | null;
  fecha: string;
  total: number;
  cerradas: number;
  bultos: number;
};

export default async function PaginaConductor() {
  const sesion = await auth();
  const id = sesion!.user.id;

  // El RLS ya limita a las rutas del conductor; el filtro explícito deja
  // claro qué se pide y sirve también a un admin que quiera echar un vistazo.
  //
  // Una ruta pendiente se muestra siempre, tenga la fecha que tenga: un
  // reparto atrasado sigue siendo trabajo por hacer. Solo las ya terminadas
  // dejan de estorbar a los dos días. El recuento de paradas se agrega en la
  // base en vez de traerlas todas para contarlas aquí.
  const filas = await comoUsuario<Fila>(
    id,
    `select r.id, r.indice, r.km, r.salida_real, r.estado,
            d.nombre as despacho, d.fecha,
            count(p.id)::int as total,
            count(p.id) filter (where p.estado_entrega <> 'pendiente')::int as cerradas,
            coalesce(sum(p.bultos), 0)::int as bultos
       from rutas r
       join despachos d on d.id = r.despacho_id
       left join paradas p on p.ruta_id = r.id
      where r.conductor_id = $1
        and not r.sin_asignar
        and (r.estado not in ('completada','cancelada')
             or d.fecha >= current_date - 2)
      group by r.id, r.indice, r.km, r.salida_real, r.estado, d.nombre, d.fecha
      order by r.indice`,
    [id],
  );

  const rutas: RutaResumen[] = filas.map((r) => ({
    id: r.id,
    etiqueta: `R-${String(r.indice + 1).padStart(2, "0")}`,
    despacho: r.despacho ?? "Despacho",
    fecha: r.fecha,
    total: r.total,
    cerradas: r.cerradas,
    bultos: r.bultos,
    km: r.km,
    salidaReal: r.salida_real,
  }));

  return <ListaRutas nombre={sesion!.user.nombre ?? sesion!.user.email ?? "Conductor"} rutas={rutas} />;
}
