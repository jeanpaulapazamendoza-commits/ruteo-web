"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  borrarSubestado,
  guardarSubestado,
  type Subestado,
} from "@/app/acciones/datos";
import {
  AccionesPagina, BOTON_PRIMARIO, BOTON_SECUNDARIO, Paginacion, usePaginas,
} from "@/components/Paginacion";
import { Celda, Pastilla, Tabla } from "@/components/ui";

/**
 * Los subestados: los motivos que el conductor elige de una lista.
 *
 * El campo libre sigue existiendo para lo que no quepa en ninguno, pero sin
 * lista no se puede contar cuántas entregas fallaron por «local cerrado»:
 * cada conductor lo escribe distinto y no hay forma de sumarlos.
 *
 * La pantalla sigue la de la referencia: una tabla con el nombre, el estado
 * al que pertenece y su orden, y un botón para crear.
 */
const ESTADOS = [
  { clave: "fallido", texto: "No entregado", tono: "bad" as const },
  { clave: "parcial", texto: "Entrega parcial", tono: "warn" as const },
  { clave: "reprogramado", texto: "Reprogramado", tono: "warn" as const },
  { clave: "entregado", texto: "Entregado", tono: "ok" as const },
];

const infoDe = (clave: string) =>
  ESTADOS.find((e) => e.clave === clave) ?? { clave, texto: clave, tono: "plan" as const };

export default function GestionSubestados({ lista }: { lista: Subestado[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [soloEstado, setSoloEstado] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState("fallido");
  const [nuevoTexto, setNuevoTexto] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    const texto = nuevoTexto.trim();
    if (!texto) return;
    setOcupado("nuevo");
    setError(null);
    try {
      await guardarSubestado({
        estado: nuevoEstado,
        texto,
        orden: lista.filter((s) => s.estado === nuevoEstado).length,
      });
      setNuevoTexto("");
      setCreando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function alternar(s: Subestado) {
    setOcupado(String(s.id));
    setError(null);
    try {
      if (s.activo) await borrarSubestado(s.id);
      else await guardarSubestado({ id: s.id, estado: s.estado, texto: s.texto, activo: true });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  const q = busca.trim().toLowerCase();
  const filtrados = lista.filter(
    (s) => (!q || s.texto.toLowerCase().includes(q)) && (!soloEstado || s.estado === soloEstado),
  );
  const { pagina, setPagina, total, visibles } = usePaginas(filtrados, 15);

  return (
    <div>
      <AccionesPagina>
        <Link href="/bitacora" className={BOTON_SECUNDARIO}>
          Bitácora
        </Link>
        <button onClick={() => { setCreando((v) => !v); setError(null); }} className={BOTON_PRIMARIO}>
          + Crear subestado
        </button>
      </AccionesPagina>

      {creando && (
        <form
          onSubmit={(e) => { e.preventDefault(); void crear(); }}
          className="mb-3 grid grid-cols-1 gap-2 rounded-[8px] border border-line p-3 @2xl:grid-cols-[220px_1fr_auto_auto]"
        >
          <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)} className="w-full outline-none">
            {ESTADOS.map((e) => (
              <option key={e.clave} value={e.clave}>{e.texto}</option>
            ))}
          </select>
          <input
            value={nuevoTexto}
            onChange={(e) => setNuevoTexto(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder={nuevoEstado === "fallido" ? "Local cerrado, nadie atiende" : "Nombre del subestado"}
            className="w-full outline-none"
          />
          <button
            type="submit"
            disabled={ocupado === "nuevo" || !nuevoTexto.trim()}
            className={`${BOTON_PRIMARIO} h-10 justify-center`}
          >
            {ocupado === "nuevo" ? "Creando…" : "Crear"}
          </button>
          <button type="button" onClick={() => setCreando(false)} className={`${BOTON_SECUNDARIO} h-10 justify-center`}>
            Cancelar
          </button>
        </form>
      )}

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 pb-3 @xl:grid-cols-[1fr_260px]">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nombre"
          className="w-full outline-none"
        />
        <select value={soloEstado} onChange={(e) => setSoloEstado(e.target.value)} className="w-full outline-none">
          <option value="">Estado</option>
          {ESTADOS.map((e) => (
            <option key={e.clave} value={e.clave}>{e.texto}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-3 rounded-[8px] border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-[8px] border border-line [&>div:first-child]:rounded-none [&>div:first-child]:border-0">
        <Tabla cabeceras={["Nombre", "Estado", "Orden", "Tipo", "Vigencia", ""]} anchoMin={720}>
          {visibles.map((s) => {
            const info = infoDe(s.estado);
            return (
              <tr key={s.id} className={`hover:bg-surface-2 ${s.activo ? "" : "opacity-55"}`}>
                <Celda>
                  <span className={s.activo ? "text-[#0792e0]" : "line-through"}>{s.texto}</span>
                </Celda>
                <Celda>
                  <Pastilla tono={info.tono}>{info.texto}</Pastilla>
                </Celda>
                <Celda className="num">{s.orden}</Celda>
                <Celda>Móvil</Celda>
                <Celda>{s.activo ? "Activo" : "Retirado"}</Celda>
                <Celda className="text-right">
                  <button
                    onClick={() => void alternar(s)}
                    disabled={ocupado === String(s.id)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
                      s.activo
                        ? "border-line-strong text-ink-2 hover:bg-canvas"
                        : "border-ok text-ok hover:bg-ok-bg"
                    }`}
                  >
                    {ocupado === String(s.id) ? "…" : s.activo ? "Retirar" : "Reactivar"}
                  </button>
                </Celda>
              </tr>
            );
          })}
        </Tabla>

        {filtrados.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-ink-2">
            {lista.length === 0
              ? "Todavía no hay subestados. Mientras tanto el conductor ve los de serie."
              : "Ningún subestado coincide."}
          </p>
        ) : (
          <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
        )}
      </div>

      <p className="mt-3 text-[12px] text-ink-3">
        Retirar un subestado no lo borra: lo deja de ofrecer. Las paradas ya
        marcadas con él lo siguen nombrando, y un informe del mes pasado
        seguiría cuadrando.
      </p>
    </div>
  );
}
