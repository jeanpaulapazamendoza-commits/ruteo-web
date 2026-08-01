"use client";

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
    enlaces: [{ href: "/flota", icono: "▣", texto: "Flota" }],
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

export default function NavLateral({
  nombre,
  empresa,
  rol,
}: {
  nombre: string;
  empresa: string;
  rol: string;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const secciones = rol === "admin" ? [...SECCIONES, SECCION_ADMIN] : SECCIONES;

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
    <nav className="flex w-[232px] shrink-0 flex-col gap-6 bg-navy-900 p-3 text-[#c7d2e2]">
      <div className="flex items-center gap-3 px-1.5 py-1">
        <div className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-gradient-to-br from-amber to-amber-600 text-base font-extrabold text-[#231403]">
          R
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-white">
            RuteoTiendas
          </div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7e90a8]">
            Last mile
          </div>
        </div>
      </div>

      {secciones.map((seccion) => (
        <div key={seccion.titulo} className="flex flex-col gap-0.5">
          <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#5c6e88]">
            {seccion.titulo}
          </div>
          {seccion.enlaces.map((e) => {
            const activo = ruta === e.href || ruta.startsWith(e.href + "/");
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={activo ? "page" : undefined}
                className={[
                  "flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] transition",
                  activo
                    ? "bg-navy-700 font-semibold text-white shadow-[inset_2px_0_0_var(--color-amber)]"
                    : "font-medium text-[#b4c2d6] hover:bg-white/[0.06] hover:text-white",
                ].join(" ")}
              >
                <span className="w-[17px] text-center opacity-90">
                  {e.icono}
                </span>
                {e.texto}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto border-t border-white/10 pt-3">
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border border-white/15 bg-navy-600 text-[11.5px] font-bold text-[#dce6f3]">
            {iniciales || "?"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold leading-tight text-[#e6edf6]">
              {nombre}
            </div>
            <div className="truncate text-[11px] text-[#7e90a8]">{empresa}</div>
          </div>
        </div>
        <button
          onClick={salir}
          className="mt-2 w-full rounded-[9px] px-2.5 py-2 text-left text-[13px] font-medium text-[#b4c2d6] transition hover:bg-white/[0.06] hover:text-white"
        >
          <span className="mr-2.5 inline-block w-[17px] text-center">⏻</span>
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
