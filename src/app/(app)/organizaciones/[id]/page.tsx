import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { unaFila } from "@/lib/db";
import { BarraSuperior, Tarjeta, Pastilla } from "@/components/ui";
import FichaEmpresa, { type DetalleOrg } from "@/components/FichaEmpresa";

export default async function PaginaEmpresa({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");
  if (!sesion.user.esDesarrollador) redirect("/planificador");

  const fila = await unaFila<{ detalle: DetalleOrg | null }>(
    sesion.user.id,
    "select public.detalle_organizacion($1) as detalle",
    [id],
  );
  // La función se niega sola si quien pregunta no es el desarrollador, así
  // que aquí un resultado vacío solo puede significar que la empresa no existe.
  const detalle = fila?.detalle ?? null;
  if (!detalle?.empresa) notFound();

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/organizaciones" className="transition hover:text-ink">
            ← Empresas
          </Link>
        }
        titulo={detalle.empresa.nombre}
        acciones={
          <Pastilla tono={detalle.empresa.activa ? "ok" : "bad"}>
            {detalle.empresa.activa ? "Activa" : "Suspendida"}
          </Pastilla>
        }
      />
      <div className="p-4">
        <FichaEmpresa detalle={detalle} />
      </div>
    </>
  );
}
