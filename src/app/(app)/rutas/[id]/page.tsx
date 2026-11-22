import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { miRol } from "@/app/acciones/datos";
import { detalleRuta } from "@/app/acciones/rutas";
import { comoUsuario } from "@/lib/db";
import { asegurarTrazados } from "@/lib/trazado";
import { BarraSuperior } from "@/components/ui";
import DetalleRuta, { type Persona, type Transporte } from "@/components/DetalleRuta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Una ruta: quién la lleva, cuándo sale, sus órdenes y su mapa.
 *
 * En la referencia es «Rutas › número». Aquí el número es la placa del
 * vehículo o, si aún no tiene, su número dentro del despacho.
 */
export default async function PaginaDetalleRuta({
  params,
}: {
  // En Next 16 los parámetros de ruta llegan como promesa.
  params: Promise<{ id: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");
  const usuario = sesion.user.id;

  const { id } = await params;
  // Lo que llega de la barra de direcciones acaba en un `uuid` de Postgres.
  if (!UUID.test(id)) notFound();

  // Si se reordenó o se le movieron órdenes, el recorrido se vuelve a dibujar
  // por calles antes de leerlo.
  await asegurarTrazados(usuario, { ruta: id });

  const [ruta, conductores, vehiculos, rol] = await Promise.all([
    detalleRuta(id),
    comoUsuario<Persona>(
      usuario,
      "select id, nombre from perfiles where rol = 'conductor' and activo order by nombre",
    ),
    comoUsuario<Transporte>(
      usuario,
      "select id, nombre, placa, conductor_id from vehiculos where activo order by nombre",
    ),
    miRol(),
  ]);
  if (!ruta) notFound();

  const nombre = ruta.placa ?? `R-${String(ruta.indice + 1).padStart(2, "0")}`;

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/rutas" className="transition hover:text-ink">
            ← Rutas
          </Link>
        }
        titulo={nombre}
      />
      <DetalleRuta ruta={ruta} conductores={conductores} vehiculos={vehiculos} rol={rol} />
    </>
  );
}
