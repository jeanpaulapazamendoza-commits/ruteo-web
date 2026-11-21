import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resumenRutasDelMes, rutasLista } from "@/app/acciones/rutas";
import { BarraSuperior } from "@/components/ui";
import PanelRutas from "@/components/PanelRutas";
import { ZONA } from "@/lib/horas";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** El día de hace `n` días, en la zona de la operación. */
function haceDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: ZONA });
}

/**
 * Las rutas de todos los despachos, una por fila.
 *
 * Por defecto la última semana, como en la referencia: es el plazo en el que
 * todavía se discute una ruta.
 */
export default async function PaginaRutas({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const q = await searchParams;
  // Lo que llega de la barra de direcciones acaba en un `::date` de Postgres.
  const hasta = q.hasta && DIA.test(q.hasta) ? q.hasta : haceDias(0);
  const desde = q.desde && DIA.test(q.desde) ? q.desde : haceDias(7);

  const [rutas, resumen] = await Promise.all([rutasLista(desde, hasta), resumenRutasDelMes()]);

  return (
    <>
      <BarraSuperior migaja="" titulo="Rutas" />
      <PanelRutas rutas={rutas} resumen={resumen} desde={desde} hasta={hasta} />
    </>
  );
}
