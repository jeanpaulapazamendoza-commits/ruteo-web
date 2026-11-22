"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClienteFila } from "@/app/acciones/clientes";
import {
  AccionesPagina, BOTON_SECUNDARIO, Contador, Paginacion, usePaginas,
} from "@/components/Paginacion";
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
  // Un campo por dato, como en la referencia: quien busca por correo no
  // quiere que le salgan los clientes de una calle que se llama parecido.
  const [f, setF] = useState({ nombre: "", codigo: "", correo: "", desde: "", hasta: "" });
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
    const nombre = f.nombre.trim().toLowerCase();
    const codigo = f.codigo.trim().toLowerCase();
    const correo = f.correo.trim().toLowerCase();
    return clientes.filter((c) => {
      if (soloRecurrentes && !c.recurrente) return false;
      if (soloConFallos && c.fallidas === 0) return false;
      // El nombre busca también en teléfono, distrito y dirección: es el
      // campo al que va quien solo tiene un dato suelto del cliente.
      if (
        nombre &&
        !(
          c.nombre.toLowerCase().includes(nombre) ||
          (c.distrito ?? "").toLowerCase().includes(nombre) ||
          (c.telefono ?? "").includes(nombre) ||
          (c.direccion ?? "").toLowerCase().includes(nombre)
        )
      ) return false;
      if (codigo && !c.codigo.toLowerCase().includes(codigo)) return false;
      if (correo && !(c.email ?? "").toLowerCase().includes(correo)) return false;
      // La fecha es la de su última entrega: quien no tiene ninguna no entra
      // en un rango.
      const dia = c.ultima ? String(c.ultima).slice(0, 10) : null;
      if (f.desde && (!dia || dia < f.desde)) return false;
      if (f.hasta && (!dia || dia > f.hasta)) return false;
      return true;
    });
  }, [clientes, f, soloConFallos, soloRecurrentes]);

  const filtrando = Boolean(
    f.nombre || f.codigo || f.correo || f.desde || f.hasta || soloConFallos || soloRecurrentes,
  );

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

  const { pagina, setPagina, total, visibles: filas } = usePaginas(filtrados, 15);

  return (
    <div>
      <AccionesPagina>
        <button onClick={exportar} disabled={!filtrados.length} className={BOTON_SECUNDARIO}>
          ⤓ Exportar
        </button>
        <Link href="/planificador" className={BOTON_SECUNDARIO}>
          ⤒ Importar
        </Link>
      </AccionesPagina>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 pb-2 @xl:grid-cols-2 @4xl:grid-cols-[1.4fr_1fr_1.2fr_1.2fr]">
        <input
          value={f.nombre}
          onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))}
          placeholder="Nombre, teléfono o dirección"
          className="w-full outline-none"
        />
        <input
          value={f.codigo}
          onChange={(e) => setF((x) => ({ ...x, codigo: e.target.value }))}
          placeholder="ID de cliente"
          className="num w-full outline-none"
        />
        <input
          value={f.correo}
          onChange={(e) => setF((x) => ({ ...x, correo: e.target.value }))}
          placeholder="Correo"
          className="w-full outline-none"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            title="Última entrega desde"
            value={f.desde}
            max={f.hasta || undefined}
            onChange={(e) => setF((x) => ({ ...x, desde: e.target.value }))}
            className="num w-full min-w-0 outline-none"
          />
          <input
            type="date"
            title="Última entrega hasta"
            value={f.hasta}
            min={f.desde || undefined}
            onChange={(e) => setF((x) => ({ ...x, hasta: e.target.value }))}
            className="num w-full min-w-0 outline-none"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pb-3">
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
        {filtrando && (
          <button
            onClick={() => {
              setF({ nombre: "", codigo: "", correo: "", desde: "", hasta: "" });
              setSoloConFallos(false);
              setSoloRecurrentes(false);
            }}
            className="h-8 rounded-full px-3 text-[13px] font-bold text-ink-2 transition hover:bg-canvas"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <Contador n={filtrados.length} texto="clientes">
        <SelectorColumnas
          columnas={columnas}
          elegidas={elegidas}
          alternar={alternar}
          fijas={fijas}
        />
      </Contador>

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
        <div className="overflow-hidden rounded-[8px] border border-line [&>div:first-child]:rounded-none [&>div:first-child]:border-0">
          <Tabla cabeceras={visibles.map((c) => c.texto)} anchoMin={760}>
            {filas.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2">
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
          <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
        </div>
      )}
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
      className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${
        activo
          ? "border-amber-600 bg-amber-050 text-ink"
          : "border-line-strong bg-surface text-ink-2 hover:bg-canvas"
      }`}
    >
      {texto}
    </button>
  );
}
