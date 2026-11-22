"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * El menú de la configuración.
 *
 * En la referencia los ajustes no están en el carril de módulos: se entra por
 * el engranaje de la barra superior y, una vez dentro, hay un segundo menú a
 * la izquierda con grupos que se pliegan, un buscador y la versión abajo.
 * Aquí se sigue igual, con los ajustes que este sistema tiene.
 */
type Entrada = { href: string; texto: string; solo?: "admin" | "desarrollador" };

const GRUPOS: { titulo: string; entradas: Entrada[] }[] = [
  {
    titulo: "Cuentas",
    entradas: [
      { href: "/cuenta", texto: "Mi cuenta" },
      { href: "/organizaciones", texto: "Empresas", solo: "desarrollador" },
    ],
  },
  {
    titulo: "Usuarios",
    entradas: [{ href: "/equipo", texto: "Usuarios", solo: "admin" }],
  },
  {
    titulo: "Gestionar",
    entradas: [
      { href: "/subestados", texto: "Subestados", solo: "admin" },
      { href: "/zonas", texto: "Zonas de reparto" },
      { href: "/bases", texto: "Bases" },
      { href: "/tiendas", texto: "Tiendas guardadas", solo: "admin" },
    ],
  },
  {
    titulo: "Configuración avanzada",
    entradas: [{ href: "/bitacora", texto: "Bitácora", solo: "admin" }],
  },
];

export default function MenuAjustes({
  rol,
  desarrollador,
}: {
  rol: "admin" | "planificador" | "conductor";
  desarrollador: boolean;
}) {
  const ruta = usePathname();
  const [busca, setBusca] = useState("");
  const [plegados, setPlegados] = useState<string[]>([]);

  const permitida = (e: Entrada) =>
    !e.solo || (e.solo === "admin" ? rol === "admin" : desarrollador);

  const q = busca.trim().toLowerCase();
  const grupos = GRUPOS.map((g) => ({
    ...g,
    entradas: g.entradas.filter(
      (e) => permitida(e) && (!q || e.texto.toLowerCase().includes(q)),
    ),
  })).filter((g) => g.entradas.length > 0);

  const todosAbiertos = plegados.length === 0;
  const activa = (href: string) => ruta === href || ruta.startsWith(href + "/");

  return (
    <aside className="sticky top-0 hidden h-[calc(100vh-52px)] w-[262px] shrink-0 self-start overflow-y-auto rounded-br-[30px] bg-surface px-3 pb-6 pt-4 shadow-[0_6px_12px_rgba(0,0,0,0.15)] @4xl:block">
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-ink-2">
          ⌕
        </span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar"
          className="h-9 w-full rounded-[4px] border border-line bg-surface pl-9 pr-3 text-[14px] text-ink outline-none focus:border-amber"
        />
      </label>

      <button
        onClick={() => setPlegados(todosAbiertos ? grupos.map((g) => g.titulo) : [])}
        className="flex w-full items-center px-1 py-2 text-left text-[14px] text-ink-2"
      >
        <span className="flex-1">{todosAbiertos ? "Contraer todo" : "Expandir todo"}</span>
        <span className={`text-[10px] transition-transform ${todosAbiertos ? "rotate-180" : ""}`}>▼</span>
      </button>

      <div className="border-t border-line pt-2">
        {grupos.map((g) => {
          // Buscando se enseña todo lo que coincide, esté plegado o no.
          const abierto = Boolean(q) || !plegados.includes(g.titulo);
          return (
            <div key={g.titulo} className="pb-1">
              <button
                onClick={() =>
                  setPlegados((p) =>
                    p.includes(g.titulo) ? p.filter((x) => x !== g.titulo) : [...p, g.titulo],
                  )
                }
                aria-expanded={abierto}
                className="flex w-full items-center px-1 py-2 text-left text-[14px] font-bold text-ink"
              >
                <span className="flex-1">{g.titulo}</span>
                <span className={`text-[10px] font-normal transition-transform ${abierto ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>

              {abierto &&
                g.entradas.map((e) => (
                  <Link
                    key={e.href}
                    href={e.href}
                    className={`block rounded-[4px] px-3 py-[7px] text-[14px] transition ${
                      activa(e.href)
                        ? "bg-amber-050 font-semibold text-navy-900"
                        : "text-ink-2 hover:bg-canvas"
                    }`}
                  >
                    {e.texto}
                  </Link>
                ))}
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-line px-1 pt-3 text-[13px] text-ink-3">PuriqGo</div>
    </aside>
  );
}
