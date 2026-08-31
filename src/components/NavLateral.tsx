"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

const SECCIONES = [
  {
    titulo: "Operación",
    enlaces: [
      { href: "/planificador", icono: "◈", texto: "Planificador" },
      { href: "/torre", icono: "◉", texto: "Torre de control" },
      { href: "/despachos", icono: "▤", texto: "Despachos" },
    ],
  },
  {
    titulo: "Datos",
    enlaces: [
      { href: "/zonas", icono: "⬡", texto: "Zonas de reparto" },
      { href: "/flota", icono: "▣", texto: "Flota" },
    ],
  },
];

// Sección visible solo para administradores de la empresa. «Tiendas guardadas»
// ya no es parte del día a día: el archivo se sube en el planificador y se
// persiste al guardar el despacho. Queda aquí para consultar y limpiar.
const SECCION_ADMIN = {
  titulo: "Administración",
  enlaces: [
    { href: "/equipo", icono: "◐", texto: "Equipo" },
    { href: "/tiendas", icono: "▦", texto: "Tiendas guardadas" },
  ],
};

// Solo para quien administra el servicio, no la operación de una empresa.
const SECCION_DEV = {
  titulo: "Desarrollador",
  enlaces: [{ href: "/organizaciones", icono: "⬢", texto: "Empresas" }],
};

const CLAVE = "ruteo:nav";

/**
 * Barra lateral, plegable a una tira de iconos.
 *
 * Medía 232 px fijos y no los soltaba. En un portátil de 1050 o en una tablet
 * eso es la quinta parte de la pantalla dedicada a un menú de ocho enlaces,
 * mientras la torre de control apretaba su tabla de incidencias hasta necesitar
 * scroll horizontal. Plegada mide 60 px y devuelve 172 al módulo que se está
 * usando, sin esconder la navegación: los iconos siguen ahí y a un clic.
 *
 * Por defecto se pliega sola por debajo de 1280 px de ventana, y esa decisión
 * la toma el CSS —no JavaScript— para que el ancho ya sea el correcto en el
 * primer pintado. Si el usuario decide a mano, su elección manda y se recuerda.
 */
export default function NavLateral({
  nombre,
  empresa,
  rol,
  esDesarrollador = false,
}: {
  nombre: string;
  empresa: string;
  rol: string;
  esDesarrollador?: boolean;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const secciones = [
    ...SECCIONES,
    ...(rol === "admin" ? [SECCION_ADMIN] : []),
    ...(esDesarrollador ? [SECCION_DEV] : []),
  ];

  // «auto» = lo decide el ancho de la ventana por CSS. Las otras dos son una
  // elección explícita del usuario, que pesa más que el tamaño de pantalla.
  const [modo, setModo] = useState<"auto" | "abierta" | "cerrada">("auto");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado === "abierta" || guardado === "cerrada") setModo(guardado);
    } catch {
      /* modo privado: se queda en automático */
    }
  }, []);

  function alternar() {
    // Desde «auto» no se sabe cómo se está viendo, así que se mira la ventana:
    // el botón siempre hace lo contrario de lo que el usuario tiene delante.
    const abiertaAhora = modo === "auto" ? window.innerWidth >= 1280 : modo === "abierta";
    const nuevo = abiertaAhora ? "cerrada" : "abierta";
    setModo(nuevo);
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch {
      /* la elección dura lo que la pestaña */
    }
  }

  // Un único sitio donde se decide el ancho, y otro donde se decide qué texto
  // se ve. Repartir esta condición por el marcado es cómo se acaba con una
  // barra de 60 px que aún reserva sitio para las etiquetas.
  const ancho =
    modo === "auto" ? "w-[60px] xl:w-[232px]" : modo === "abierta" ? "w-[232px]" : "w-[60px]";
  const texto =
    modo === "auto" ? "hidden xl:block" : modo === "abierta" ? "block" : "hidden";
  // El inverso de `texto`. En automático, quién está plegada lo decide el CSS,
  // así que la flecha del botón también tiene que decidirse por CSS: con una
  // condición de JavaScript el botón dice «plegar» estando ya plegado.
  const soloPlegada =
    modo === "auto" ? "block xl:hidden" : modo === "abierta" ? "hidden" : "block";

  async function salir() {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const iniciales = nombre
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <nav
      className={`flex ${ancho} shrink-0 flex-col gap-6 bg-navy-900 p-2 text-[#c7d2e2] transition-[width] duration-150 xl:p-3`}
    >
      <div className="flex items-center gap-3 px-0.5 py-1 xl:px-1.5">
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-amber to-amber-600 text-base font-extrabold text-[#231403]">
          R
        </div>
        <div className={`${texto} min-w-0 leading-tight`}>
          <div className="truncate text-[15px] font-bold tracking-tight text-white">
            RuteoTiendas
          </div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7e90a8]">
            Last mile
          </div>
        </div>
      </div>

      {secciones.map((seccion) => (
        <div key={seccion.titulo} className="flex flex-col gap-0.5">
          <div
            className={`${texto} px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#5c6e88]`}
          >
            {seccion.titulo}
          </div>
          {seccion.enlaces.map((e) => {
            const activo = ruta === e.href || ruta.startsWith(e.href + "/");
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={activo ? "page" : undefined}
                // Plegada, el icono es lo único que queda: el nombre tiene que
                // llegar por el título del navegador o el menú es un jeroglífico.
                title={e.texto}
                className={[
                  "flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] transition",
                  activo
                    ? "bg-navy-700 font-semibold text-white shadow-[inset_2px_0_0_var(--color-amber)]"
                    : "font-medium text-[#b4c2d6] hover:bg-white/[0.06] hover:text-white",
                ].join(" ")}
              >
                <span className="w-[17px] shrink-0 text-center opacity-90">{e.icono}</span>
                <span className={`${texto} truncate`}>{e.texto}</span>
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto border-t border-white/10 pt-3">
        <button
          onClick={alternar}
          title="Plegar o desplegar el menú"
          aria-label="Plegar o desplegar el menú"
          className="mb-1 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-medium text-[#b4c2d6] transition hover:bg-white/[0.06] hover:text-white"
        >
          <span className="w-[17px] shrink-0 text-center">
            <span className={soloPlegada}>»</span>
            <span className={texto}>«</span>
          </span>
          <span className={`${texto} truncate`}>Plegar menú</span>
        </button>

        <div className="flex items-center gap-2.5 px-0.5 py-1 xl:px-1.5" title={`${nombre} · ${empresa}`}>
          <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border border-white/15 bg-navy-600 text-[11.5px] font-bold text-[#dce6f3]">
            {iniciales || "?"}
          </div>
          <div className={`${texto} min-w-0`}>
            <div className="truncate text-[12.5px] font-semibold leading-tight text-[#e6edf6]">
              {nombre}
            </div>
            <div className="truncate text-[11px] text-[#7e90a8]">{empresa}</div>
          </div>
        </div>

        <button
          onClick={salir}
          title="Cerrar sesión"
          className="mt-2 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-medium text-[#b4c2d6] transition hover:bg-white/[0.06] hover:text-white"
        >
          <span className="w-[17px] shrink-0 text-center">⏻</span>
          <span className={`${texto} truncate`}>Cerrar sesión</span>
        </button>
      </div>
    </nav>
  );
}
