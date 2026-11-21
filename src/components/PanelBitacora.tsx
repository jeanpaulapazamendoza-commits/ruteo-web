"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { bitacora as traerBitacora, type Cambio } from "@/app/acciones/datos";
import { aCSV, descargar, nombreArchivo } from "@/lib/exportar";
import { fechaHora, hoy } from "@/lib/horas";
import { Tarjeta } from "@/components/ui";

/** Nombres de columna en castellano; el resto se muestra tal cual. */
const CAMPO: Record<string, string> = {
  estado_entrega: "Estado de entrega",
  subestado: "Motivo tipificado",
  hora_entrega: "Hora de entrega",
  bultos_entregados: "Bultos entregados",
  foto_url: "Foto",
  gps_lat: "GPS latitud",
  gps_lon: "GPS longitud",
  conductor_id: "Conductor",
  vehiculo_id: "Vehículo",
  salida_real: "Salida real",
  fin_real: "Fin real",
  estado: "Estado",
  nombre: "Nombre",
  rol: "Rol",
  activo: "Activo",
  eta: "Hora estimada",
  motivo: "Motivo",
  observaciones: "Observaciones",
  recibe: "Quién recibió",
  extra: "Datos del archivo",
  parametros: "Parámetros",
  kpis: "Indicadores",
};

const TABLA: Record<string, string> = {
  paradas: "Parada",
  despachos: "Despacho",
  rutas: "Ruta",
  perfiles: "Usuario",
};

/** Un valor largo o vacío se lee mejor recortado y con una marca. */
function valor(v: string | null) {
  if (v === null || v === "") return "—";
  return v.length > 70 ? v.slice(0, 70) + "…" : v;
}

export default function PanelBitacora({ inicial }: { inicial: Cambio[] }) {
  const [lista, setLista] = useState(inicial);
  const [texto, setTexto] = useState("");
  const [desde, setDesde] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => setLista(inicial), [inicial]);

  const buscar = useCallback(async (t: string, d: string) => {
    setCargando(true);
    try {
      const r = await traerBitacora({ texto: t, desde: d || undefined });
      if (montado.current) { setLista(r); setError(null); }
    } catch (e) {
      if (montado.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void buscar(texto, desde), 350);
    return () => clearTimeout(t);
  }, [texto, desde, buscar]);

  // Los cambios de una misma escritura llegan con la misma hora y el mismo
  // registro: se agrupan para que se lean como «fulano editó esta parada» y
  // no como diez líneas sueltas.
  const grupos = useMemo(() => {
    const m = new Map<string, Cambio[]>();
    lista.forEach((c) => {
      const k = `${c.registro_id}|${c.autor ?? ""}|${c.cuando.slice(0, 19)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    });
    return [...m.values()];
  }, [lista]);

  function exportar() {
    const csv = aCSV(
      ["Cuándo", "Quién", "Qué", "Registro", "Campo", "Antes", "Después"],
      lista.map((c) => [
        fechaHora(c.cuando),
        c.autor ?? "el sistema",
        TABLA[c.tabla] ?? c.tabla,
        c.etiqueta ?? c.registro_id,
        CAMPO[c.campo] ?? c.campo,
        c.antes,
        c.despues,
      ]),
    );
    descargar(nombreArchivo("bitacora", hoy()), csv);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 text-[11.5px] text-ink-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Parada, despacho o campo"
          className="w-[240px] rounded-[8px] border border-line-strong bg-surface px-2.5 py-1 text-[12px]"
        />
        <label className="flex items-center gap-1">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="num rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[11.5px]"
          />
        </label>
        <span className="ml-auto flex items-center gap-2">
          <span className="num">
            {cargando ? "buscando…" : `${lista.length} cambios`}
          </span>
          <button
            onClick={exportar}
            disabled={!lista.length}
            className="rounded-full border border-line-strong bg-surface px-2.5 py-1 font-semibold text-ink-2 transition hover:bg-canvas disabled:opacity-50"
          >
            ⤓ Exportar a Excel
          </button>
        </span>
      </div>

      <div className="space-y-2 p-3">
        {error && (
          <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
            {error}
          </p>
        )}

        {grupos.length === 0 ? (
          <Tarjeta className="p-6 text-[13.5px] text-ink-2">
            Nada registrado todavía en ese rango. La bitácora empieza a
            llenarse en cuanto alguien cambia algo.
          </Tarjeta>
        ) : (
          grupos.map((g) => {
            const c = g[0];
            return (
              <Tarjeta key={c.id} className="overflow-hidden">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-3.5 py-1.5 text-[12.5px]">
                  <b className="text-ink">{c.autor ?? "El sistema"}</b>
                  <span className="text-ink-2">
                    editó {(TABLA[c.tabla] ?? c.tabla).toLowerCase()}
                  </span>
                  {c.tabla === "paradas" ? (
                    <Link
                      href={`/paradas/${c.registro_id}`}
                      className="font-semibold text-ink transition hover:underline"
                    >
                      {c.etiqueta ?? c.registro_id.slice(0, 8)}
                    </Link>
                  ) : (
                    <b className="text-ink">{c.etiqueta ?? c.registro_id.slice(0, 8)}</b>
                  )}
                  <span className="num ml-auto text-[11.5px] text-ink-3">
                    {fechaHora(c.cuando)}
                  </span>
                </div>

                <table className="w-full border-collapse text-[12px]">
                  <tbody>
                    {g.map((x) => (
                      <tr key={x.id}>
                        <td className="w-[170px] border-b border-line px-3.5 py-1 font-semibold text-ink-2">
                          {CAMPO[x.campo] ?? x.campo}
                        </td>
                        <td className="border-b border-line px-3 py-1 text-ink-3 line-through">
                          {valor(x.antes)}
                        </td>
                        <td className="w-5 border-b border-line text-center text-ink-3">→</td>
                        <td className="border-b border-line px-3 py-1 text-ink">
                          {valor(x.despues)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tarjeta>
            );
          })
        )}

        <p className="text-[11.5px] text-ink-3">
          Lo escribe un disparador de la base, no la aplicación: queda
          registrado cualquier cambio, venga de una pantalla, de una función o
          de alguien conectado a la base. Nadie puede modificar ni borrar lo
          ya anotado.
        </p>
      </div>
    </>
  );
}
