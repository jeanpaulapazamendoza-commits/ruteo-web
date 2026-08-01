"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Pastilla, Tarjeta } from "@/components/ui";

export type ResumenOrg = {
  id: string;
  nombre: string;
  activa: boolean;
  suspendida_en: string | null;
  nota: string | null;
  creado_en: string;
  usuarios: number;
  admins: number;
  conductores: number;
  despachos: number;
  paradas_30d: number;
  ultima_actividad: string | null;
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/**
 * Padrón de empresas clientes.
 *
 * Aquí solo se ven totales de uso: cuánta gente y cuánto movimiento tiene
 * cada una. Las tiendas, las rutas y las entregas de cada empresa son suyas
 * y no aparecen — el desarrollador administra el servicio, no la operación
 * de sus clientes.
 */
export default function PadronEmpresas({ empresas }: { empresas: ResumenOrg[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function cambiar(org: ResumenOrg) {
    const suspender = org.activa;
    if (
      suspender &&
      !window.confirm(
        `¿Suspender «${org.nombre}»?\n\nSus ${org.usuarios} usuario(s) dejarán de ver ` +
          `sus datos al instante. Nada se borra: al reactivarla vuelve todo.`,
      )
    ) {
      return;
    }
    setOcupado(org.id);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      const { error: fallo } = await supabase.rpc("cambiar_estado_organizacion", {
        p_org: org.id,
        p_activa: !org.activa,
        p_nota: null,
      });
      if (fallo) throw fallo;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] text-ink-2">
          Cada empresa ve solo sus datos. Suspender corta el acceso al instante
          sin borrar nada.
        </p>
        <button
          onClick={() => { setCreando((v) => !v); setError(null); }}
          className="ml-auto rounded-[9px] border border-amber-600 bg-amber px-3.5 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white"
        >
          + Dar de alta una empresa
        </button>
      </div>

      {creando && <FormularioAlta onCerrar={() => setCreando(false)} onListo={() => router.refresh()} />}

      {error && (
        <p className="mb-3 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          {error}
        </p>
      )}

      <Tarjeta className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr>
                {["Empresa", "Estado", "Usuarios", "Choferes", "Ruteos", "Paradas 30 d", "Última actividad", ""].map(
                  (h, i) => (
                    <th
                      key={h + i}
                      className={`border-b border-line bg-surface-2 px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3 ${
                        i >= 2 && i <= 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {empresas.map((o) => (
                <tr key={o.id} className={o.activa ? "" : "opacity-60"}>
                  <td className="border-b border-line px-3.5 py-2.5">
                    <div className="font-semibold text-ink">{o.nombre}</div>
                    <div className="num text-[11.5px] text-ink-3">
                      Alta {fecha(o.creado_en)}
                    </div>
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5">
                    <Pastilla tono={o.activa ? "ok" : "bad"}>
                      {o.activa ? "Activa" : "Suspendida"}
                    </Pastilla>
                    {!o.activa && o.suspendida_en && (
                      <div className="num mt-0.5 text-[11px] text-ink-3">
                        desde {fecha(o.suspendida_en)}
                      </div>
                    )}
                  </td>
                  <td className="num border-b border-line px-3.5 py-2.5 text-right">
                    {o.usuarios}
                    {o.admins === 0 && (
                      <span className="ml-1 text-[11px] text-warn">sin admin</span>
                    )}
                  </td>
                  <td className="num border-b border-line px-3.5 py-2.5 text-right">
                    {o.conductores}
                  </td>
                  <td className="num border-b border-line px-3.5 py-2.5 text-right">
                    {o.despachos}
                  </td>
                  <td className="num border-b border-line px-3.5 py-2.5 text-right">
                    {Number(o.paradas_30d).toLocaleString("es-PE")}
                  </td>
                  <td className="num border-b border-line px-3.5 py-2.5 text-[12px] text-ink-2">
                    {fecha(o.ultima_actividad)}
                  </td>
                  <td className="border-b border-line px-3.5 py-2.5 text-right">
                    <button
                      onClick={() => cambiar(o)}
                      disabled={ocupado === o.id}
                      className={`rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
                        o.activa
                          ? "border-line-strong text-bad hover:bg-bad-bg"
                          : "border-ok/40 text-ok hover:bg-ok-bg"
                      }`}
                    >
                      {ocupado === o.id ? "…" : o.activa ? "Suspender" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <p className="mt-3 text-[11.5px] text-ink-3">
        Aquí no se ven las tiendas, las rutas ni las entregas de tus clientes:
        solo cuánta gente y cuánto movimiento tiene cada empresa.
      </p>
    </>
  );
}

/** Alta de empresa con su primer administrador, que es quien la pone en marcha. */
function FormularioAlta({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const [empresa, setEmpresa] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(claveTemporal());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ empresa: string; email: string; password: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/organizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa, nombre, email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? "No se pudo crear.");
      setCreado({ empresa, email, password });
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
        <h4 className="text-[14px] font-bold text-ok">✓ Empresa creada</h4>
        <p className="mt-1.5 text-[13px] text-ink-2">
          Pásale estos datos al administrador de <b>{creado.empresa}</b>. Desde
          su panel de Equipo dará de alta a sus planificadores y choferes.
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
      <h4 className="mb-1 text-[14px] font-bold">Nueva empresa</h4>
      <p className="mb-3 text-[12.5px] text-ink-2">
        Se crea la empresa y su primer administrador. Todo lo demás lo monta él
        desde dentro.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Nombre de la empresa</span>
          <input required value={empresa} onChange={(e) => setEmpresa(e.target.value)}
            placeholder="AliExpress Perú"
            className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Administrador</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ana Torres"
            className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">Su correo</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@aliexpress.com"
            className="w-full rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]" />
        </label>
        <label className="block sm:col-span-2">
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
          className="rounded-[9px] border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white disabled:opacity-50">
          {enviando ? "Creando…" : "Crear empresa"}
        </button>
        <button type="button" onClick={onCerrar}
          className="rounded-[9px] border border-line-strong bg-surface px-4 py-2 text-[13px] font-semibold transition hover:bg-canvas">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function claveTemporal() {
  const s = "abcdefghijkmnpqrstuvwxyz23456789";
  return "Ruteo-" + Array.from({ length: 6 }, () => s[Math.floor(Math.random() * s.length)]).join("");
}
