import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { miRol } from "@/app/acciones/datos";
import { datosEditor } from "@/app/acciones/editor";
import { BarraSuperior, Tarjeta } from "@/components/ui";
import EditorRutas from "@/components/EditorRutas";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El editor de rutas de un despacho: ordenar a mano, pasar órdenes de una
 * ruta a otra y volver a rutear.
 *
 * En la referencia esto es el planificador avanzado. Aquí cuelga del
 * despacho porque es sobre un reparto ya armado donde tiene sentido: antes
 * de rutear no hay rutas que editar.
 */
export default async function PaginaEditarRutas({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [datos, rol] = await Promise.all([datosEditor(id), miRol()]);
  if (!datos) notFound();
  // El conductor ve su ruta, no la reparte.
  if (rol === "conductor") redirect("/");

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href={`/despachos/${id}`} className="transition hover:text-ink">
            ← {datos.despacho.nombre ?? "Despacho"}
          </Link>
        }
        titulo="Editar rutas"
      />
      {datos.rutas.length ? (
        <EditorRutas datos={datos} />
      ) : (
        <div>
          <Tarjeta className="p-5">
            <h3 className="text-[14px] font-bold tracking-tight">Este despacho todavía no tiene rutas</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
              Primero hay que rutearlo en el planificador. Cuando tenga rutas, aquí se ordenan a mano.
            </p>
            <Link
              href={`/planificador?despacho=${id}`}
              className="mt-4 inline-block rounded-full border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-amber-600 hover:text-white"
            >
              ◈ Rutear este despacho
            </Link>
          </Tarjeta>
        </div>
      )}
    </>
  );
}
