"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { salir as cerrarSesion } from "@/app/acciones-sesion";

/**
 * El armazón: barra superior y carril de módulos.
 *
 * Sigue la disposición del sistema de última milla que se tomó de
 * referencia, con sus medidas: una barra azul noche de 52 px con la marca a
 * la izquierda y la cuenta a la derecha, y debajo un carril blanco de 52 px
 * con un icono por módulo, que al pasar el ratón se abre a 224 px y enseña
 * los nombres. El carril flota sobre el contenido al abrirse: la pantalla no
 * se mueve de sitio cada vez que el ratón roza el borde.
 *
 * Los nueve primeros módulos son los de la referencia, en su orden y con sus
 * nombres. Debajo de la raya van los que este sistema tiene de más.
 */
type Modulo = { href: string; texto: string; icono: ReactNode };

/** Iconos de trazo, dibujados para este carril. 18 px, heredan el color. */
function Trazo({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const I = {
  actividad: (
    <Trazo>
      <path d="M4 6h16M4 12h10M4 18h13" />
      <circle cx="18" cy="12" r="2" />
    </Trazo>
  ),
  nueva: (
    <Trazo>
      <path d="M4 6h16M4 12h7M4 18h7" />
      <path d="M17 13v6M14 16h6" />
    </Trazo>
  ),
  rutas: (
    <Trazo>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8.2 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.8" />
    </Trazo>
  ),
  ordenes: (
    <Trazo>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4v3h6V4M9 12h6M9 16h4" />
    </Trazo>
  ),
  flota: (
    <Trazo>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </Trazo>
  ),
  estadisticas: (
    <Trazo>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 15l4-5 3 3 4-6" />
    </Trazo>
  ),
  alertas: (
    <Trazo>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Trazo>
  ),
  clientes: (
    <Trazo>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="10" r="2.3" />
      <path d="M16 14.6a4.5 4.5 0 0 1 4.5 4.4" />
    </Trazo>
  ),
  importar: (
    <Trazo>
      <path d="M12 16V5M8 9l4-4 4 4" />
      <path d="M5 15v4h14v-4" />
    </Trazo>
  ),
  torre: (
    <Trazo>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Trazo>
  ),
  zonas: (
    <Trazo>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    </Trazo>
  ),
  equipo: (
    <Trazo>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Trazo>
  ),
  motivos: (
    <Trazo>
      <path d="M4 20l4-1 10-10-3-3L5 16z" />
      <path d="M14 7l3 3" />
    </Trazo>
  ),
  bitacora: (
    <Trazo>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h5" />
    </Trazo>
  ),
  tiendas: (
    <Trazo>
      <path d="M4 9l1.5-5h13L20 9M5 9v11h14V9" />
      <path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" />
    </Trazo>
  ),
  empresas: (
    <Trazo>
      <path d="M4 21V5l8-2v18M12 9l8 2v10M4 21h16" />
      <path d="M7.5 9h1M7.5 13h1M7.5 17h1M15.5 14h1M15.5 18h1" />
    </Trazo>
  ),
};

/** Los módulos de la referencia, en su orden y con sus nombres. */
const PRINCIPALES: Modulo[] = [
  { href: "/actividad", texto: "Actividad", icono: I.actividad },
  { href: "/actividad-nueva", texto: "Nueva Actividad", icono: I.nueva },
  { href: "/rutas", texto: "Rutas", icono: I.rutas },
  { href: "/ordenes", texto: "Órdenes", icono: I.ordenes },
  { href: "/flota", texto: "Flota", icono: I.flota },
  { href: "/estadisticas", texto: "Estadísticas", icono: I.estadisticas },
  { href: "/alertas", texto: "Alertas", icono: I.alertas },
  { href: "/clientes", texto: "Clientes", icono: I.clientes },
  { href: "/importaciones", texto: "Importar", icono: I.importar },
];

/**
 * Lo que este sistema tiene además, debajo de la raya.
 *
 * Solo lo que es operación del día. La configuración —usuarios, subestados,
 * zonas, bitácora— no va en el carril: se entra por el engranaje de la barra
 * superior, como en la referencia, y tiene su propio menú.
 */
const PROPIOS: Modulo[] = [
  { href: "/planificador", texto: "Planificador", icono: I.zonas },
  { href: "/despachos", texto: "Despachos", icono: I.bitacora },
  { href: "/torre", texto: "Torre de control", icono: I.torre },
];

/** Las rutas que son configuración: encienden el engranaje. */
const AJUSTES = ["/equipo", "/subestados", "/zonas", "/bitacora", "/tiendas", "/organizaciones"];

export default function BarraModulos({
  nombre,
  empresa,
  rol,
  esDesarrollador,
  avisos = 0,
  children,
}: {
  nombre: string;
  empresa: string;
  rol: "admin" | "planificador" | "conductor";
  esDesarrollador: boolean;
  /** Alertas sin atender, para el punto rojo sobre el módulo. */
  avisos?: number;
  children: ReactNode;
}) {
  const ruta = usePathname();
  const router = useRouter();

  const propios = PROPIOS;

  // A dónde lleva el engranaje: a la primera pantalla de ajustes que el rol
  // puede ver. Un planificador no entra en Usuarios, pero sí en Zonas.
  const ajustes = rol === "admin" ? "/equipo" : "/zonas";
  const enAjustes = AJUSTES.some((a) => ruta === a || ruta.startsWith(a + "/"));

  const activo = (href: string) => ruta === href || ruta.startsWith(href + "/");

  const iniciales = nombre
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function salir() {
    await cerrarSesion();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      {/* Barra superior: 52 px, marca a la izquierda, cuenta a la derecha. */}
      <header className="relative z-40 flex h-[52px] shrink-0 items-center bg-navy-900 pl-5 pr-3">
        <Link href="/actividad" title="PuriqGo" className="flex items-center gap-2.5">
          {/* La marca va escrita, sin isotipo: nombre en blanco, una raya
              fina y el producto al lado, como en la referencia. */}
          <span className="text-[21px] font-bold leading-none tracking-[-0.02em] text-white">
            Puriq Go
          </span>
          <span className="h-[18px] w-px bg-white/40" />
          <span className="text-[19px] font-light leading-none text-amber">
            últimamilla
          </span>
        </Link>

        <div className="ml-auto flex items-center">
          <Link
            href={ajustes}
            title="Configuración"
            aria-label="Configuración"
            className={`grid h-[52px] w-9 place-items-center transition hover:bg-white/[0.07] hover:text-white ${
              enAjustes ? "text-amber" : "text-white/80"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" />
            </svg>
          </Link>
          <Link
            href="/cuenta"
            title={`${nombre} · ${empresa} — Mi cuenta`}
            className="flex h-[52px] items-center gap-2.5 px-2.5 transition hover:bg-white/[0.07]"
          >
            <div className="hidden min-w-0 text-right md:block">
              <div className="truncate text-[12.5px] font-semibold leading-tight text-white">
                {nombre}
              </div>
              <div className="truncate text-[11px] leading-tight text-white/60">
                {empresa}
              </div>
            </div>
            <div className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full bg-amber text-[11px] font-bold text-white">
              {iniciales || "?"}
            </div>
          </Link>

          <button
            onClick={salir}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="grid h-[52px] w-9 place-items-center text-white/80 transition hover:bg-white/[0.07] hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9" />
            </svg>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Hueco fijo de 52 px: el carril de verdad flota encima y se abre
            sin empujar el contenido. */}
        <div className="w-[52px] shrink-0" />

        <aside className="group/carril absolute inset-y-0 left-0 z-30 w-[52px] overflow-hidden rounded-br-[30px] bg-surface shadow-[0_6px_12px_rgba(0,0,0,0.15)] transition-[width] duration-200 hover:w-[224px]">
          <nav className="flex h-full flex-col overflow-y-auto overflow-x-hidden pb-6 pt-[30px]">
            {PRINCIPALES.map((m) => (
              <Item
                key={m.href}
                modulo={m}
                activo={activo(m.href)}
                aviso={m.href === "/alertas" ? avisos : 0}
              />
            ))}

            {propios.length > 0 && <div className="mx-3 my-2 h-px shrink-0 bg-line" />}

            {propios.map((m) => (
              <Item key={m.href} modulo={m} activo={activo(m.href)} aviso={0} />
            ))}
          </nav>
        </aside>

        {/* `@container` para que las pantallas midan el sitio que de verdad
            tienen, y no el de la ventana. `lienzo` pone el panel blanco bajo
            el título; está en globals.css. */}
        <main className="lienzo @container flex min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function Item({
  modulo,
  activo,
  aviso,
}: {
  modulo: Modulo;
  activo: boolean;
  aviso: number;
}) {
  return (
    <Link
      href={modulo.href}
      title={modulo.texto}
      className={`relative flex h-10 w-[224px] shrink-0 items-center gap-4 border-l-[3px] pl-[14px] pr-4 text-[14px] transition-colors ${
        activo
          ? "border-amber bg-amber-050 font-semibold text-navy-900"
          : "border-transparent text-ink hover:bg-canvas"
      }`}
    >
      <span className={`relative shrink-0 ${activo ? "text-navy-800" : "text-amber"}`}>
        {modulo.icono}
        {aviso > 0 && (
          <span className="num absolute -right-2 -top-2 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-bad px-1 text-[9px] font-bold leading-none text-white">
            {aviso > 99 ? "99" : aviso}
          </span>
        )}
      </span>
      <span className="truncate opacity-0 transition-opacity duration-150 group-hover/carril:opacity-100">
        {modulo.texto}
      </span>
    </Link>
  );
}
