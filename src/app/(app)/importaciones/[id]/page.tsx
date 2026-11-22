import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { importacionDetalle } from "@/app/acciones/datos";
import { BarraSuperior } from "@/components/ui";
import DetalleImportacion from "@/components/DetalleImportacion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un archivo subido: qué traía, qué se rechazó y qué órdenes dejó. */
export default async function PaginaDetalleImportacion({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const { id } = await params;
  // Lo que llega de la barra de direcciones acaba en un `uuid` de Postgres.
  if (!UUID.test(id)) notFound();

  const datos = await importacionDetalle(id);
  if (!datos) notFound();

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/importaciones" className="transition hover:text-ink">
            ← Últimas importaciones
          </Link>
        }
        titulo="Detalle"
      />
      <DetalleImportacion datos={datos} />
    </>
  );
}
