"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Tarjeta, Pastilla } from "@/components/ui";

export type MiembroEquipo = {
  id: string;
  nombre: string | null;
  email: string | null;
  rol: "admin" | "planificador" | "conductor";
  activo: boolean;
  creado_en: string;
};

function claveTemporal() {
  // Contraseña temporal legible para dictar; el usuario la cambia luego.
  const s = "abcdefghijkmnpqrstuvwxyz23456789";
  return "Ruteo-" + Array.from({ length: 6 }, () => s[Math.floor(Math.random() * s.length)]).join("");
}

export default function GestionEquipo({
  miembros,
  miId,
}: {
  miembros: MiembroEquipo[];
  miId: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abrirAlta, setAbrirAlta] = useState(false);

  async function actualizar(id: string, cambios: Partial<MiembroEquipo>, ctx: string) {
    setOcupado(ctx);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      const { error } = await supabase.from("perfiles").update(cambios).eq("id", id);
      if (error) throw error;
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // El trigger de base de datos protege al último admin.
      setError(
        /último administrador|ningún administrador/i.test(msg)
          ? "No puedes dejar a la empresa sin ningún administrador activo."
          : msg,
      );
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <p className="text-[13px] text-ink-2">
          Gestiona quién entra a la plataforma de tu empresa y con qué permisos.
        </p>
        <button
          onClick={() => { setAbrirAlta((v) => !v); setError(null); }}
          className="ml-auto rounded-[9px] border border-amber-600 bg-amber px-3.5 py-2 text-[13px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white"
        >
          + Agregar usuario
        </button>
      </div>

      {abrirAlta && <FormularioAlta onCerrar={() => setAbrirAlta(false)} onListo={() => router.refresh()} />}

      {error && (
        <p className="mb-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          {error}
        </p>
      )}

      <Tarjeta className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr>
                {["Persona", "Rol", "Estado", "Acciones"].map((h) => (
                  <th key={h} className="border-b border-line bg-surface-2 px-3.5 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {miembros.map((m) => {
                const soyYo = m.id === miId;
                const cargando = ocupado?.startsWith(m.id);
                return (
                  <tr key={m.id} className={m.activo ? "" : "opacity-60"}>
                    <td className="border-b border-line px-3.5 py-2.5">
                      <div className="font-semibold text-ink">
                        {m.nombre ?? "—"}
                        {soyYo && <span className="ml-2 text-[11px] font-normal text-ink-3">(tú)</span>}
                      </div>
                      <div className="text-[12px] text-ink-3">{m.email}</div>
                    </td>
                    <td className="border-b border-line px-3.5 py-2.5">
                      <select
                        value={m.rol}
                        disabled={cargando || soyYo}
                        onChange={(e) => actualizar(m.id, { rol: e.target.value as MiembroEquipo["rol"] }, `${m.id}-rol`)}
                        className="rounded-[8px] border border-line-strong bg-surface px-2 py-1 text-[12.5px] disabled:opacity-60"
                        title={soyYo ? "No puedes cambiar tu propio rol" : ""}
                      >
                        <option value="admin">Administrador</option>
                        <option value="planificador">Planificador</option>
                        <option value="conductor">Conductor</option>
                      </select>
                    </td>
                    <td className="border-b border-line px-3.5 py-2.5">
                      <Pastilla tono={m.activo ? "ok" : "plan"}>
                        {m.activo ? "Activo" : "Desactivado"}
                      </Pastilla>
                    </td>
                    <td className="border-b border-line px-3.5 py-2.5">
                      {soyYo ? (
                        <span className="text-[12px] text-ink-3">—</span>
                      ) : (
                        <button
                          onClick={() => actualizar(m.id, { activo: !m.activo }, `${m.id}-act`)}
                          disabled={cargando}
                          className={`rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
                            m.activo
                              ? "border-line-strong text-bad hover:bg-bad-bg"
                              : "border-ok/40 text-ok hover:bg-ok-bg"
                          }`}
                        >
                          {cargando ? "…" : m.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <p className="mt-3 text-[11.5px] text-ink-3">
        Los <b>conductores</b> usan la app de reparto; los <b>planificadores</b>{" "}
        arman las rutas; los <b>administradores</b> además gestionan el equipo.
        Desactivar a alguien le corta el acceso al instante sin borrar su historial.
      </p>
    </>
  );
}

function FormularioAlta({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("conductor");
  const [password, setPassword] = useState(claveTemporal());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, rol, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? "No se pudo crear.");
      setCreado({ email, password });
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  if (creado) {
    return (
      <div className="mb-3 rounded-[12px] border border-ok/30 bg-ok-bg p-4">
        <h4 className="text-[14px] font-bold text-ok">✓ Usuario creado</h4>
        <p className="mt-1.5 text-[13px] text-ink-2">
          Comparte estos datos con la persona. Podrá entrar de inmediato y cambiar
          su contraseña después.
        </p>
        <div className="mt-2.5 rounded-[9px] border border-line bg-surface px-3 py-2 text-[13px]">
          <div>Correo: <b className="num">{creado.email}</b></div>
          <div>Contraseña temporal: <b className="num">{creado.password}</b></div>
        </div>
        <button
          onClick={onCerrar}
          className="mt-3 rounded-[9px] border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-semibold transition hover:bg-canvas"
        >
          Listo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="mb-3 rounded-[12px] border border-line bg-surface p-4">
      <h4 className="mb-3 text-[14px] font-bold">Agregar usuario a tu empresa</h4>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Luis Quispe"
            className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Correo</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="luis@empresa.com"
            className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value)}
            className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]">
            <option value="conductor">Conductor</option>
            <option value="planificador">Planificador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Contraseña temporal</span>
          <div className="flex gap-1.5">
            <input value={password} onChange={(e) => setPassword(e.target.value)}
              className="num w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]" />
            <button type="button" onClick={() => setPassword(claveTemporal())} title="Generar otra"
              className="shrink-0 rounded-[9px] border border-line-strong px-2 text-[13px] transition hover:bg-canvas">
              ↻
            </button>
          </div>
        </label>
      </div>

      {error && (
        <p className="mt-2.5 rounded-[9px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={enviando}
          className="rounded-[9px] border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white disabled:opacity-50">
          {enviando ? "Creando…" : "Crear usuario"}
        </button>
        <button type="button" onClick={onCerrar}
          className="rounded-[9px] border border-line-strong bg-surface px-4 py-2 text-[13px] font-semibold transition hover:bg-canvas">
          Cancelar
        </button>
      </div>
    </form>
  );
}
