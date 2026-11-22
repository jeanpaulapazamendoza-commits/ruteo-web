"use client";

import Link from "next/link";
import type { DetalleImportacion as Datos, OrdenImportada } from "@/app/acciones/datos";
import { AccionesPagina, Contador, Paginacion, usePaginas } from "@/components/Paginacion";
import { Pastilla } from "@/components/ui";
import { estado as infoEstado } from "@/lib/despachos";
import { aCSV, descargar } from "@/lib/exportar";
import { fechaHora } from "@/lib/horas";

const ESTADO: Record<string, { texto: string; tono: "ok" | "warn" | "bad" | "live" }> = {
  entregado: { texto: "Entregado", tono: "ok" },
  parcial: { texto: "Parcial", tono: "warn" },
  reprogramado: { texto: "Reprogramado", tono: "warn" },
  fallido: { texto: "No entregado", tono: "bad" },
  pendiente: { texto: "Pendiente", tono: "live" },
};

const corta = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * Lo que traía un archivo y en qué quedó.
 *
 * Es la pantalla «Importaciones › Detalle» de la referencia: el identificador
 * y el estado, tres cifras —órdenes agregadas, filas del archivo, errores— y
 * la lista de órdenes que entraron.
 *
 * Los errores y avisos son los que dio el lector al subir el archivo. Antes
 * solo se veían en ese momento; ahora se guardan con el archivo, así que
 * quien llega al día siguiente puede saber por qué faltan tres tiendas.
 */
export default function DetalleImportacion({ datos: d }: { datos: Datos }) {
  const { pagina, setPagina, total, visibles } = usePaginas(d.ordenes, 15);

  const inf = d.detalle ?? {};
  const conInforme = inf.leidas != null;
  const errores = inf.errores ?? [];
  const avisos = inf.avisos ?? [];
  const nErrores = inf.errores_total ?? errores.length;
  const nAvisos = inf.avisos_total ?? avisos.length;
  const excluidas = avisos.filter((a) => a.excluida).length;

  /**
   * Las órdenes, en el formato de la plantilla: el archivo que sale se puede
   * volver a subir tal cual. No es el original —ese no se guarda—, es lo que
   * quedó en el sistema.
   */
  function bajar() {
    const csv = aCSV(
      ["codigo_sucursal", "name_sucursal", "distrito", "direccion", "latitud", "longitud",
       "cantidad_bultos", "prioridad", "hora_inicio", "hora_fin"],
      d.ordenes.map((o) => [
        o.codigo, o.nombre, o.distrito, o.direccion, o.lat, o.lon, o.bultos, o.prioridad,
        corta(o.ventana_ini), corta(o.ventana_fin),
      ]),
    );
    descargar(`ordenes-${d.nombre_archivo.replace(/\.[^.]+$/, "")}.csv`, csv);
  }

  return (
    <div className="flex flex-col gap-5">
      <AccionesPagina>
        <button
          onClick={bajar}
          disabled={!d.ordenes.length}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[14px] font-bold text-ink transition hover:bg-canvas disabled:opacity-50"
        >
          ⤓ Descargar órdenes
        </button>
      </AccionesPagina>

      {/* Identificador, estado y las tres cifras */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <span className="flex items-baseline gap-2">
          <span className="text-[12.5px] text-ink-2">ID</span>
          <b className="num text-[20px] leading-none text-ink">{d.id.slice(0, 8)}</b>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {d.despachos.length === 0 ? (
            <Pastilla tono="warn">Importado sin rutear</Pastilla>
          ) : nErrores + nAvisos > 0 ? (
            <Pastilla tono="warn">Importado con observaciones</Pastilla>
          ) : (
            <Pastilla tono="ok">Importado</Pastilla>
          )}
        </span>
        <Cifra texto="Órdenes agregadas" valor={d.ordenes.length} />
        <Cifra texto="Filas del archivo" valor={inf.leidas ?? d.filas ?? "—"} />
        <Cifra texto="Errores" valor={conInforme ? nErrores : "—"} alerta={nErrores > 0} />
        {nAvisos > 0 && <Cifra texto="Avisos" valor={nAvisos} />}
      </div>

      {/* De dónde salió y a dónde fue */}
      <div className="rounded-[10px] border border-line px-5 py-4 text-[13px] leading-relaxed text-ink-2">
        <div>
          <b className="text-ink">{d.nombre_archivo}</b>
          {" · subido "}
          <span className="num">{fechaHora(d.creado_en)}</span>
          {d.autor && <> por <b className="text-ink">{d.autor}</b></>}
        </div>
        {d.despachos.length === 0 ? (
          <p className="mt-1.5">
            Este archivo no llegó a convertirse en despacho: se subió al planificador y se
            dejó sin guardar.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {d.despachos.map((x) => {
              const e = infoEstado(x.estado);
              return (
                <span key={x.id} className="flex items-center gap-2">
                  <Link
                    href={`/despachos/${x.id}`}
                    className="font-semibold text-amber-600 underline underline-offset-2"
                  >
                    {x.nombre ?? "Despacho"}
                  </Link>
                  <Pastilla tono={e.tono}>{e.texto}</Pastilla>
                </span>
              );
            })}
          </div>
        )}
        {!conInforme && (
          <p className="mt-2 text-[12px] text-ink-3">
            Este archivo se subió antes de que se guardara el informe de lectura: no consta qué
            filas se rechazaron, si hubo alguna.
          </p>
        )}
      </div>

      {/* Lo que no entró */}
      {errores.length > 0 && (
        <details className="rounded-[10px] border border-bad/30 px-5 py-4" open>
          <summary className="cursor-pointer text-[13.5px] font-bold text-bad">
            {nErrores} fila{nErrores === 1 ? "" : "s"} que no entr{nErrores === 1 ? "ó" : "aron"}
          </summary>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            {errores.map((e, i) => (
              <li key={i}>
                <b className="num text-ink">Fila {e.fila}</b> · {e.motivo}
              </li>
            ))}
            {nErrores > errores.length && (
              <li className="text-ink-3">…y {nErrores - errores.length} más, que no se guardaron.</li>
            )}
          </ul>
        </details>
      )}

      {/* Lo que entró con dudas */}
      {avisos.length > 0 && (
        <details className="rounded-[10px] border border-warn/30 px-5 py-4">
          <summary className="cursor-pointer text-[13.5px] font-bold text-warn">
            {nAvisos} con coordenada dudosa
            {excluidas > 0 && (
              <span className="font-normal text-ink-2"> · {excluidas} se dejaron fuera al subirlo</span>
            )}
          </summary>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            {avisos.map((a, i) => (
              <li key={i}>
                <b className="num text-ink">Fila {a.fila}</b> · <span className="num">{a.codigo}</span> ·{" "}
                {a.motivo}
                {a.excluida && <span className="ml-1.5 text-bad">(no entró)</span>}
              </li>
            ))}
            {nAvisos > avisos.length && (
              <li className="text-ink-3">…y {nAvisos - avisos.length} más, que no se guardaron.</li>
            )}
          </ul>
        </details>
      )}

      {/* Las órdenes */}
      <div>
        <Contador n={d.ordenes.length} texto="órdenes" />
        {d.ordenes.length === 0 ? (
          <p className="rounded-[8px] border border-line p-6 text-[14px] text-ink-2">
            No hay órdenes de este archivo en el sistema.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[8px] border border-line">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr>
                    <th className="text-left">Orden</th>
                    <th className="text-left">Nombre</th>
                    <th className="text-left">Dirección</th>
                    <th className="text-left">Vehículo</th>
                    <th className="text-right">#Ítems</th>
                    <th className="text-right">Bultos</th>
                    <th className="text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((o) => <Fila key={o.id} orden={o} />)}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
          </div>
        )}
        {d.ordenes.length >= 5000 && (
          <p className="mt-2 text-[12px] text-warn">Se muestran las primeras 5000.</p>
        )}
      </div>
    </div>
  );
}

function Fila({ orden: o }: { orden: OrdenImportada }) {
  const e = ESTADO[o.estado_entrega] ?? { texto: o.estado_entrega, tono: "live" as const };
  return (
    <tr className="transition hover:bg-surface-2">
      <td className="border-b border-line align-middle">
        <Link href={`/paradas/${o.id}`} className="num font-semibold">
          {o.codigo ?? o.id.slice(0, 8)}
        </Link>
      </td>
      <td className="border-b border-line align-middle text-ink">{o.nombre ?? "—"}</td>
      <td className="border-b border-line align-middle">
        {o.direccion ?? o.distrito ?? "—"}
        {o.direccion && o.distrito && (
          <span className="block text-[11.5px] text-ink-3">{o.distrito}</span>
        )}
      </td>
      <td className="num border-b border-line align-middle">
        {o.ruta_indice == null
          ? <span className="text-ink-3">sin asignar</span>
          : (o.placa ?? `R-${String(o.ruta_indice + 1).padStart(2, "0")}`)}
      </td>
      <td className="num border-b border-line text-right align-middle">{o.items || "—"}</td>
      <td className="num border-b border-line text-right align-middle">{o.bultos}</td>
      <td className="border-b border-line align-middle">
        <Pastilla tono={e.tono}>{e.texto}</Pastilla>
      </td>
    </tr>
  );
}

function Cifra({
  texto, valor, alerta = false,
}: {
  texto: string;
  valor: string | number;
  alerta?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[12.5px] text-ink-2">{texto}</span>
      <b className={`num text-[18px] leading-none ${alerta ? "text-bad" : "text-ink"}`}>{valor}</b>
    </span>
  );
}
