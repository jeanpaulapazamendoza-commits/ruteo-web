import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { unaFila } from "@/lib/db";
import NavLateral from "@/components/NavLateral";
import CuentaBloqueada from "@/components/CuentaBloqueada";

type Perfil = {
  nombre: string | null;
  rol: "admin" | "planificador" | "conductor";
  activo: boolean;
  es_desarrollador: boolean;
  empresa: string | null;
  empresa_activa: boolean | null;
};

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // El perfil se relee en cada carga en vez de confiar en el token: si un
  // administrador cambia un rol o desactiva a alguien, surte efecto en la
  // siguiente página y no cuando caduque la sesión treinta días después.
  //
  // El usuario siempre puede leer su propio perfil (política perfiles_select),
  // aunque esté desactivado; así se le puede mostrar la pantalla de bloqueo.
  const perfil = await unaFila<Perfil>(
    sesion.user.id,
    `select p.nombre, p.rol, p.activo, p.es_desarrollador,
            o.nombre as empresa, o.activa as empresa_activa
       from perfiles p
       left join organizaciones o on o.id = p.org_id
      where p.id = $1`,
    [sesion.user.id],
  );

  if (!perfil || perfil.activo === false) {
    return <CuentaBloqueada email={sesion.user.email ?? ""} sinPerfil={!perfil} />;
  }

  // Empresa suspendida: no es culpa del usuario y conviene decirlo distinto,
  // o el administrador del cliente perseguirá un problema que no existe.
  if (perfil.empresa_activa === false) {
    return (
      <CuentaBloqueada
        email={sesion.user.email ?? ""}
        empresaSuspendida
        empresa={perfil.empresa ?? ""}
      />
    );
  }

  // El conductor no usa el escritorio: su sitio es la app de reparto.
  if (perfil.rol === "conductor") redirect("/conductor");

  return (
    <div className="flex h-screen overflow-hidden">
      <NavLateral
        nombre={perfil.nombre ?? sesion.user.email ?? "Usuario"}
        empresa={perfil.empresa ?? "Sin empresa"}
        rol={perfil.rol}
        esDesarrollador={perfil.es_desarrollador === true}
      />
      {/* `@container` para que las pantallas midan el sitio que de verdad
          tienen. Con puntos de corte por ventana, el planificador pedía 1280
          px para abrir sus tres columnas sin descontar los 232 de esta barra:
          en un portátil de 1280 el mapa se quedaba en 388 px, y por debajo
          colapsaba a una sola columna con el mapa espachurrado. */}
      <div className="@container flex min-w-0 flex-1 flex-col overflow-y-auto bg-surface-2">
        {children}
      </div>
    </div>
  );
}
