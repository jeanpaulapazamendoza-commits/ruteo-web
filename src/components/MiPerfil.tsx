"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rpc } from "@/app/acciones/rpc";
import { Tarjeta } from "@/components/ui";

const CAMPO =
  "h-10 w-full rounded-[8px] border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none focus:border-amber";

/**
 * Los datos de la propia cuenta.
 *
 * El nombre lo cambia cada uno: es cómo aparece en las rutas, en la bitácora
 * y en la barra de arriba. El correo es con lo que se entra, y el rol y la
 * empresa deciden qué se puede ver, así que esos tres los toca un
 * administrador.
 */
export default function MiPerfil({
  nombre: inicial,
  email,
  rol,
  empresa,
}: {
  nombre: string;
  email: string;
  rol: string;
  empresa: string;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial);
  const [guardado, setGuardado] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cambiado = nombre.trim() !== guardado.trim() && nombre.trim().length >= 2;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!cambiado) return;
    setOcupado(true);
    setError(null);
    setListo(false);
    try {
      const nuevo = await rpc<string>("cambiar_mi_nombre", { p_nombre: nombre });
      setGuardado(nuevo ?? nombre.trim());
      setNombre(nuevo ?? nombre.trim());
      setListo(true);
      // La barra de arriba lee el nombre en cada carga.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta className="max-w-[460px] p-5">
      <h3 className="text-[15px] font-bold tracking-tight">Mis datos</h3>

      <form onSubmit={guardar} className="mt-3">
        <label className="block text-[13px] font-semibold text-ink-2">
          Nombre
          <input
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setListo(false); }}
            maxLength={80}
            autoComplete="name"
            className={`${CAMPO} mt-1 font-normal`}
          />
        </label>
        <div className="mt-2.5 flex items-center gap-3">
          <button
            type="submit"
            disabled={!cambiado || ocupado}
            className="inline-flex h-9 items-center rounded-full bg-amber px-4 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {ocupado ? "Guardando…" : "Guardar nombre"}
          </button>
          {listo && <span role="status" className="text-[13px] font-semibold text-ok">Guardado</span>}
          {error && <span role="alert" className="text-[13px] font-semibold text-bad">{error}</span>}
        </div>
      </form>

      <dl className="mt-4 divide-y divide-line border-t border-line text-[14px]">
        {[["Correo", email], ["Rol", rol], ["Empresa", empresa]].map(([k, v]) => (
          <div key={k} className="flex gap-3 py-2.5">
            <dt className="w-[84px] shrink-0 text-ink-2">{k}</dt>
            <dd className="min-w-0 break-words font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12px] text-ink-3">
        El correo, el rol y la empresa los cambia un administrador en Configuración → Usuarios.
      </p>
    </Tarjeta>
  );
}
