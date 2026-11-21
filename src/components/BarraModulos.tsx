"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { salir as cerrarSesion } from "@/app/acciones-sesion";
import Logo from "@/components/Logo";

/**
 * Los módulos, en una barra arriba.
 *
 * Antes era una barra lateral de 232 px. En un sistema de última milla la
 * pantalla se la comen el mapa y las tablas, y un menú de once enlaces no
 * merece una quinta parte del ancho todo el día: puesto arriba cuesta 46 px
 * de alto y devuelve el ancho entero a lo que se está mirando.
 *
 * El orden es el del turno, no el del organigrama: primero lo que se mira
 * cada mañana, al final lo que se toca una vez al mes.
 */
type Modulo = { href: string; texto: string; icono: string };

const DIARIOS: Modulo[] = [
  { href: "/actividad", texto: "Actividad", icono: "◧" },
  { href: "/planificador", texto: "Planificador", icono: "◈" },
  { href: "/torre", texto: "Torre", icono: "◉" },
  { href: "/flota", texto: "Flota", icono: "▣" },
  { href: "/alertas", texto: "Alertas", icono: "△" },
  { href: "/ordenes", texto: "Órdenes", icono: "▥" },
  { href: "/despachos", texto: "Despachos", icono: "▤" },
  { href: "/clientes", texto: "Clientes", icono: "◍" },
  { href: "/estadisticas", texto: "Estadísticas", icono: "◫" },
];

/** Lo que se configura de vez en cuando, bajo «Más». */
const OCASIONALES: Modulo[] = [
  { href: "/zonas", texto: "Zonas de reparto", icono: "⬡" },
  { href: "/importaciones", texto: "Archivos cargados", icono: "⤓" },
];

const DE_ADMIN: Modulo[] = [
  { href: "/equipo", texto: "Equipo", icono: "◐" },
  { href: "/subestados", texto: "Motivos de entrega", icono: "✎" },
  { href: "/bitacora", texto: "Bitácora", icono: "❑" },
  { href: "/tiendas", texto: "Tiendas guardadas", icono: "▦" },
];

const DE_DESARROLLADOR: Modulo[] = [
  { href: "/organizaciones", texto: "Empresas", icono: "⬢" },
];

export default function BarraModulos({
  nombre,
  empresa,
  rol,
  esDesarrollador,
  avisos = 0,
}: {
  nombre: string;
  empresa: string;
  rol: "admin" | "planificador" | "conductor";
  esDesarrollador: boolean;
  /** Alertas sin atender, para el punto rojo sobre el módulo. */
  avisos?: number;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  const extras = [
    ...OCASIONALES,
    ...(rol === "admin" ? DE_ADMIN : []),
    ...(esDesarrollador ? DE_DESARROLLADOR : []),
  ];

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
    <header className="sticky top-0 z-40 shrink-0 bg-navy-900">
      <div className="flex h-[46px] items-center gap-1 px-3">
        <Link href="/actividad" className="mr-1.5 shrink-0" title="PuriqGo">
          <Logo variante="isotipo" alto={26} />
        </Link>

        {/* Los módulos del día. Se desplazan en horizontal antes que
            esconderse: un enlace que no se ve no se usa. */}
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {DIARIOS.map((m) => (
            <Pestana
              key={m.href}
              modulo={m}
              activo={activo(m.href)}
              aviso={m.href === "/alertas" ? avisos : 0}
            />
          ))}

          {extras.length > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setAbierto((v) => !v)}
                aria-expanded={abierto}
                className={`flex h-[46px] items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold transition ${
                  extras.some((m) => activo(m.href))
                    ? "border-amber text-white"
                    : "border-transparent text-[#b4c2d6] hover:text-white"
                }`}
              >
                Más <span className="text-[9px]">{abierto ? "▲" : "▼"}</span>
              </button>

              {abierto && (
                <>
                  {/* Capa a pantalla completa para cerrar al tocar fuera. */}
                  <button
                    aria-label="Cerrar menú"
                    onClick={() => setAbierto(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute left-0 top-full z-20 min-w-[210px] overflow-hidden rounded-b-[10px] border border-line bg-surface shadow-lg">
                    {extras.map((m) => (
                      <Link
                        key={m.href}
                        href={m.href}
                        onClick={() => setAbierto(false)}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition hover:bg-canvas ${
                          activo(m.href) ? "font-bold text-ink" : "text-ink-2"
                        }`}
                      >
                        <span className="w-4 text-center text-ink-3">{m.icono}</span>
                        {m.texto}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </nav>

        <Link
          href="/cuenta"
          title={`${nombre} · ${empresa} — Mi cuenta`}
          className="ml-2 flex shrink-0 items-center gap-2 rounded-[9px] px-1.5 py-1 transition hover:bg-white/[0.07]"
        >
          <div className="hidden min-w-0 text-right lg:block">
            <div className="truncate text-[12px] font-semibold leading-tight text-[#e6edf6]">
              {nombre}
            </div>
            <div className="truncate text-[10.5px] leading-tight text-[#7e90a8]">
              {empresa}
            </div>
          </div>
          <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-white/15 bg-navy-600 text-[10.5px] font-bold text-[#dce6f3]">
            {iniciales || "?"}
          </div>
        </Link>

        <button
          onClick={salir}
          title="Cerrar sesión"
          className="shrink-0 rounded-[9px] px-2 py-1.5 text-[14px] text-[#b4c2d6] transition hover:bg-white/[0.07] hover:text-white"
        >
          ⏻
        </button>
      </div>
    </header>
  );
}

function Pestana({
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
      className={`relative flex h-[46px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold transition ${
        activo
          ? "border-amber text-white"
          : "border-transparent text-[#b4c2d6] hover:text-white"
      }`}
    >
      <span className="text-[13px] opacity-80">{modulo.icono}</span>
      {modulo.texto}
      {aviso > 0 && (
        <span className="num ml-0.5 rounded-full bg-bad px-1.5 py-px text-[10px] font-bold text-white">
          {aviso}
        </span>
      )}
    </Link>
  );
}
