"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarDespacho } from "@/lib/despachos";

/**
 * Borrado de un ruteo, para el administrador de la empresa.
 *
 * Pide confirmación escribiendo el nombre: un ruteo son cientos de paradas y
 * un clic de más no debería llevárselas. La base solo lo permite si nadie ha
 * marcado ninguna entrega todavía.
 */
export default function BorrarDespacho({
  despachoId,
  nombre,
}: {
  despachoId: string;
  nombre: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      await eliminarDespacho(despachoId);
      router.push("/despachos");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBorrando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-bad transition hover:bg-bad-bg"
      >
        Borrar ruteo
      </button>
    );
  }

  return (
    <div className="w-full rounded-[12px] border border-bad/30 bg-bad-bg p-3">
      <p className="text-[12.5px] text-ink-2">
        Vas a borrar <b className="text-ink">{nombre}</b> con todas sus rutas y
        paradas. No se puede deshacer. Escribe el nombre para confirmar:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={nombre}
          className="min-w-[200px] flex-1 rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]"
        />
        <button
          onClick={borrar}
          disabled={borrando || texto.trim() !== nombre.trim()}
          className="rounded-[9px] border border-bad bg-bad px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition disabled:opacity-40"
        >
          {borrando ? "Borrando…" : "Borrar definitivamente"}
        </button>
        <button
          onClick={() => { setAbierto(false); setTexto(""); setError(null); }}
          className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="mt-2 text-[12.5px] font-semibold text-bad">{error}</p>}
    </div>
  );
}
