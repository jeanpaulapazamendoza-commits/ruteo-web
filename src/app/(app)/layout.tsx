import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import NavLateral from "@/components/NavLateral";
import CuentaBloqueada from "@/components/CuentaBloqueada";

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // El usuario siempre puede leer su propio perfil (política perfiles_select),
  // aunque esté desactivado; así podemos mostrarle la pantalla de bloqueo.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre, rol, activo, es_desarrollador, organizaciones(nombre, activa)")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || perfil.activo === false) {
    return <CuentaBloqueada email={user.email ?? ""} sinPerfil={!perfil} />;
  }

  // Empresa suspendida: no es culpa del usuario y conviene decirlo distinto,
  // o el administrador del cliente perseguirá un problema que no existe.
  const org = perfil.organizaciones as { nombre?: string; activa?: boolean } | null;
  if (org?.activa === false) {
    return <CuentaBloqueada email={user.email ?? ""} empresaSuspendida empresa={org.nombre ?? ""} />;
  }

  // El conductor no usa el escritorio: su sitio es la app de reparto.
  if (perfil.rol === "conductor") redirect("/conductor");

  const empresa = org?.nombre ?? "Sin empresa";

  return (
    <div className="flex h-screen overflow-hidden">
      <NavLateral
        nombre={perfil.nombre ?? user.email ?? "Usuario"}
        empresa={empresa}
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
