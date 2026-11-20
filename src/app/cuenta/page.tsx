import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { unaFila } from "@/lib/db";
import { BarraSuperior, Tarjeta } from "@/components/ui";
import CambiarClave from "@/components/CambiarClave";

/**
 * Mi cuenta.
 *
 * Vive fuera del grupo `(app)` a propósito: ese layout manda al conductor a
 * su app de reparto, y el conductor es justo quien más va a necesitar esta
 * pantalla. Sin barra lateral, con una vuelta atrás a donde trabaja cada uno.
 */
const ROL: Record<string, string> = {
  admin: "Administrador",
  planificador: "Planificador",
  conductor: "Conductor",
};

export default async function PaginaCuenta() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const yo = await unaFila<{
    nombre: string | null;
    email: string | null;
    rol: string;
    empresa: string | null;
    // Quien entró con Google puede no tener contraseña todavía.
    tiene_clave: boolean;
  }>(
    sesion.user.id,
    `select p.nombre, p.email, p.rol, o.nombre as empresa,
            public.tengo_clave() as tiene_clave
       from perfiles p
       left join organizaciones o on o.id = p.org_id
      where p.id = $1`,
    [sesion.user.id],
  );

  if (!yo) redirect("/login");

  const volver = yo.rol === "conductor" ? "/conductor" : "/planificador";

  return (
    <div className="min-h-full bg-surface-2">
      <BarraSuperior
        migaja={
          <Link href={volver} className="transition hover:text-ink">
            ← Volver
          </Link>
        }
        titulo="Mi cuenta"
      />

      <div className="flex flex-col gap-4 p-4">
        <Tarjeta className="max-w-[460px] p-5">
          <div className="flex flex-col gap-2.5 text-[13.5px]">
            <Dato etiqueta="Nombre" valor={yo.nombre ?? "—"} />
            <Dato etiqueta="Correo" valor={yo.email ?? "—"} />
            <Dato etiqueta="Rol" valor={ROL[yo.rol] ?? yo.rol} />
            <Dato etiqueta="Empresa" valor={yo.empresa ?? "Sin empresa"} />
          </div>
          <p className="mt-3.5 text-[11.5px] text-ink-3">
            El nombre, el rol y la empresa los cambia un administrador desde
            Equipo.
          </p>
        </Tarjeta>

        <CambiarClave tieneClave={yo.tiene_clave} />
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-[84px] shrink-0 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </span>
      <span className="min-w-0 break-words font-semibold">{valor}</span>
    </div>
  );
}
