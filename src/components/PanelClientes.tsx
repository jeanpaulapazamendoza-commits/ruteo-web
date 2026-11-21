"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClienteFila } from "@/app/acciones/clientes";
import SelectorColumnas, { useColumnas, type Columna } from "@/components/SelectorColumnas";
import { Celda, EstadoVacio, Pastilla, Tabla } from "@/components/ui";
import { aCSV, descargar } from "@/lib/exportar";
import { fecha } from "@/lib/horas";

/**
 * La cartera de clientes.
 *
 * Un cliente aquí no es una fila de un archivo: es un código al que se le ha
 * repartido, con todo lo que le ha pasado detrás. Por eso la lista se ordena
 * por lo que importa cuando suena el teléfono —cuántas veces se le falló— y
 * no por orden alfabético.
 */
function porcentaje(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

export default function PanelClientes({ clientes }: { clientes: ClienteFila[] }) {
  const [busca, setBusca] = useState("");
  const [soloConFallos, setSoloConFallos] = useState(false);
  const [soloRecurrentes, setSoloRecurrentes] = useState(false);

  const columnas: Columna<ClienteFila>[] = useMemo(
    () => [
      {
        clave: "nombre",
        texto: "Cliente",
        pinta: (c) => (
          <Link href={`/clientes/${c.id}`} className="font-semibold hover:underline">
            {c.nombre}
          </Link>
        ),
        exporta: (c) => c.nombre,
      },
      {
        clave: "codigo",
        texto: "Código",
        pinta: (c) => <span className="num text-ink-2">{c.codigo}</span>,
        exporta: (c) => c.codigo,
      },
      {
        clave: "telefono",
        texto: "Teléfono",
        opcional: true,
        pinta: (c) =>
          c.telefono ? (
            // Enlace `tel:`: en el móvil del supervisor llama de una pulsación,
            // que es lo que se hace con un teléfono de un cliente que no abre.
            <a href={`tel:${c.telefono}`} className="num hover:underline">
              {c.telefono}
            </a>
          ) : (
            <span className="text-ink-3">—</span>
          ),
        exporta: (c) => c.telefono,
      },
      {
        clave: "email",
        texto: "Correo",
        opcional: true,
        pinta: (c) => <span className="truncate text-ink-2">{c.email ?? "—"}</span>,
        exporta: (c) => c.email,
      },
      {
        clave: "distrito",
        texto: "Distrito",
        opcional: true,
        pinta: (c) => <span className="text-ink-2">{c.distrito ?? "—"}</span>,
        exporta: (c) => c.distrito,
      },
      {
        clave: "direccion",
        texto: "Dirección",
        opcional: true,
        pinta: (c) => (
          <span className="block max-w-[280px] truncate text-ink-2" title={c.direccion ?? ""}>
            {c.direccion ?? "—"}
          </span>
        ),
        exporta: (c) => c.direccion,
      },
      {
        clave: "ordenes",
        texto: "Paradas",
        alineacion: "derecha",
        pinta: (c) => <span className="num">{c.ordenes}</span>,
        exporta: (c) => c.ordenes,
      },
      {
        clave: "cumplimiento",
        texto: "Cumplimiento",
        alineacion: "derecha",
        pinta: (c) => {
          if (!c.ordenes) return <span className="text-ink-3">—</span>;
          const p = porcentaje(c.entregadas, c.ordenes);
          return (
            <span className={`num font-semibold ${p < 80 ? "text-bad" : ""}`}>{p}%</span>
          );
        },
        exporta: (c) => (c.ordenes ? porcentaje(c.entregadas, c.ordenes) : null),
      },
      {
        clave: "fallidas",
        texto: "Fallidas",
        alineacion: "derecha",
        opcional: true,
        pinta: (c) => (
          <span className={`num ${c.fallidas > 0 ? "font-semibold text-bad" : "text-ink-3"}`}>
            {c.fallidas}
          </span>
        ),
        exporta: (c) => c.fallidas,
      },
      {
        clave: "ultima",
        texto: "Última entrega",
        opcional: true,
        pinta: (c) => (
          <span className="num text-ink-2">{c.ultima ? fecha(c.ultima) : "—"}</span>
        ),
        exporta: (c) => (c.ultima ? fecha(c.ultima) : null),
      },
      {
        clave: "recurrente",
        texto: "Fijo",
        opcional: true,
        pinta: (c) => (c.recurrente ? <Pastilla tono="live">fijo</Pastilla> : null),
        exporta: (c) => (c.recurrente ? "sí" : "no"),
      },
    ],
    [],
  );

  const { visibles, elegidas, alternar, fijas } = useColumnas("clientes", columnas);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (soloRecurrentes && !c.recurrente) return false;
      if (soloConFallos && c.fallidas === 0) return false;
      if (!q) return true;
      return (
        c.nombre.toLowerCase().includes(q) ||
        c.codigo.toLowerCase().includes(q) ||
        (c.distrito ?? "").toLowerCase().includes(q) ||
        (c.telefono ?? "").includes(q) ||
        (c.direccion ?? "").toLowerCase().includes(q)
      );
    });
  }, [clientes, busca, soloConFallos, soloRecurrentes]);

  function exportar() {
    descargar(
      "clientes.csv",
      aCSV(
        visibles.map((c) => c.texto),
        filtrados.map((f) =>
          visibles.map((c) => (c.exporta ? c.exporta(f) : String(f[c.clave as keyof ClienteFila] ?? ""))),
        ),
      ),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nombre, código, distrito o teléfono…"
          className="min-w-[240px] flex-1 rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[12.5px] outline-none transition focus:border-amber-600"
        />

        <Interruptor
          activo={soloConFallos}
          onClic={() => setSoloConFallos((v) => !v)}
          texto="Con entregas fallidas"
        />
        <Interruptor
          activo={soloRecurrentes}
          onClic={() => setSoloRecurrentes((v) => !v)}
          texto="Solo fijos"
        />

        <span className="num text-[12px] text-ink-3">
          {filtrados.length} de {clientes.length}
        </span>

        <SelectorColumnas
          columnas={columnas}
          elegidas={elegidas}
          alternar={alternar}
          fijas={fijas}
        />

        <button
          onClick={exportar}
          disabled={!filtrados.length}
          className="rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[11.5px] font-semibold transition hover:bg-canvas disabled:opacity-50"
        >
          ⤓ Exportar
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtrados.length === 0 ? (
          <EstadoVacio
            icono="◐"
            titulo={clientes.length ? "Nada coincide" : "Todavía no hay clientes"}
            descripcion={
              clientes.length
                ? "Prueba con otro texto o quita los filtros."
                : "Los clientes se crean solos al cargar un archivo: cada código del archivo pasa a ser uno, con el teléfono y la dirección si el archivo los trae."
            }
          />
        ) : (
          <Tabla cabeceras={visibles.map((c) => c.texto)} anchoMin={760}>
            {filtrados.map((c) => (
              <tr key={c.id} className="hover:bg-canvas">
                {visibles.map((col) => (
                  <Celda
                    key={col.clave}
                    className={col.alineacion === "derecha" ? "text-right" : ""}
                  >
                    {col.pinta(c)}
                  </Celda>
                ))}
              </tr>
            ))}
          </Tabla>
        )}
      </div>
    </div>
  );
}

function Interruptor({
  activo,
  onClic,
  texto,
}: {
  activo: boolean;
  onClic: () => void;
  texto: string;
}) {
  return (
    <button
      onClick={onClic}
      aria-pressed={activo}
      className={`rounded-[8px] border px-2.5 py-1 text-[11.5px] font-semibold transition ${
        activo
          ? "border-amber-600 bg-amber-050 text-ink"
          : "border-line-strong bg-surface text-ink-2 hover:bg-canvas"
      }`}
    >
      {texto}
    </button>
  );
}
