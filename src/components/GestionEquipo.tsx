"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarPerfil } from "@/app/acciones/datos";
import { rpc } from "@/app/acciones/rpc";
import Link from "next/link";
import { Celda, Pastilla, Tabla } from "@/components/ui";
import {
  AccionesPagina, BOTON_PRIMARIO, BOTON_SECUNDARIO, Paginacion, usePaginas,
} from "@/components/Paginacion";
import { fecha } from "@/lib/horas";

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
  const [fNombre, setFNombre] = useState("");
  const [fUsuario, setFUsuario] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fRol, setFRol] = useState("");
  // La contraseña nueva se enseña una sola vez, para dictarla. No se guarda
  // en ninguna parte legible: en la base solo queda su hash.
  const [restablecida, setRestablecida] = useState<{
    nombre: string;
    email: string;
    clave: string;
  } | null>(null);

  /**
   * Restablece la contraseña de alguien del equipo.
   *
   * Genera una temporal en vez de pedirla escrita: así no hay que inventar
   * una al vuelo ni enviarla por un canal antes de que exista. Quien la
   * reciba la cambia desde Mi cuenta.
   */
  async function restablecer(m: MiembroEquipo) {
    const clave = claveTemporal();
    setOcupado(`${m.id}-clave`);
    setError(null);
    setRestablecida(null);
    try {
      await rpc("fijar_clave", { p_perfil: m.id, p_clave: clave });
      setRestablecida({ nombre: m.nombre ?? m.email ?? "", email: m.email ?? "", clave });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function actualizar(id: string, cambios: Partial<MiembroEquipo>, ctx: string) {
    setOcupado(ctx);
    setError(null);
    try {
      await actualizarPerfil(id, cambios);
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

  const filtrados = miembros.filter(
    (m) =>
      (m.nombre ?? "").toLowerCase().includes(fNombre.trim().toLowerCase()) &&
      (m.email ?? "").toLowerCase().includes(fUsuario.trim().toLowerCase()) &&
      (!fEstado || (fEstado === "activo") === m.activo) &&
      (!fRol || m.rol === fRol),
  );
  const { pagina, setPagina, total, visibles } = usePaginas(filtrados, 15);

  return (
    <div>
      <AccionesPagina>
        <Link href="/bitacora" className={BOTON_SECUNDARIO}>
          Bitácora
        </Link>
        <button
          onClick={() => { setAbrirAlta((v) => !v); setError(null); }}
          className={BOTON_PRIMARIO}
        >
          + Agregar usuario
        </button>
      </AccionesPagina>

      {abrirAlta && <FormularioAlta onCerrar={() => setAbrirAlta(false)} onListo={() => router.refresh()} />}

      {error && (
        <p className="mb-3 rounded-[8px] border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}

      {restablecida && (
        <div className="mb-3 rounded-[8px] border border-ok/30 bg-ok-bg p-4">
          <h4 className="text-[14px] font-bold text-ok">
            ✓ Contraseña restablecida
          </h4>
          <p className="mt-1.5 text-[13px] text-ink-2">
            Dictasela a <b>{restablecida.nombre}</b> y que la cambie desde
            Mi cuenta. No vas a poder volver a verla: aquí solo se muestra
            ahora.
          </p>
          <div className="mt-2.5 rounded-[6px] border border-line bg-surface px-3 py-2 text-[13px]">
            <div>Correo: <b className="num">{restablecida.email}</b></div>
            <div>Contraseña temporal: <b className="num">{restablecida.clave}</b></div>
          </div>
          <button
            onClick={() => setRestablecida(null)}
            className="mt-3 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-semibold transition hover:bg-canvas"
          >
            Listo
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-2 pb-3 @xl:grid-cols-2 @4xl:grid-cols-4">
        <input
          value={fNombre}
          onChange={(e) => setFNombre(e.target.value)}
          placeholder="Nombre"
          className="w-full outline-none"
        />
        <input
          value={fUsuario}
          onChange={(e) => setFUsuario(e.target.value)}
          placeholder="Usuario"
          className="w-full outline-none"
        />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="w-full outline-none">
          <option value="">Estado</option>
          <option value="activo">Activo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
        <select value={fRol} onChange={(e) => setFRol(e.target.value)} className="w-full outline-none">
          <option value="">Rol</option>
          <option value="admin">Administrador</option>
          <option value="planificador">Planificador</option>
          <option value="conductor">Conductor</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-line [&>div:first-child]:rounded-none [&>div:first-child]:border-0">
        <Tabla cabeceras={["Nombre", "Estado", "Usuario", "Rol/Permisos", "Alta", ""]} anchoMin={820}>
          {visibles.map((m) => {
            const soyYo = m.id === miId;
            const cargando = ocupado?.startsWith(m.id);
            return (
              <tr key={m.id} className={`hover:bg-surface-2 ${m.activo ? "" : "opacity-60"}`}>
                <Celda>
                  <span className="text-[#0792e0]">{m.nombre ?? "—"}</span>
                  {soyYo && <span className="ml-2 text-[11px] text-ink-3">(tú)</span>}
                </Celda>
                <Celda>{m.activo ? "Activo" : "Bloqueado"}</Celda>
                <Celda>{m.email}</Celda>
                <Celda>
                  <select
                    value={m.rol}
                    disabled={cargando || soyYo}
                    onChange={(e) => actualizar(m.id, { rol: e.target.value as MiembroEquipo["rol"] }, `${m.id}-rol`)}
                    className="h-8 rounded-[4px] border border-line bg-surface px-2 text-[13px] disabled:opacity-60"
                    title={soyYo ? "No puedes cambiar tu propio rol" : ""}
                  >
                    <option value="admin">Administrador</option>
                    <option value="planificador">Planificador</option>
                    <option value="conductor">Conductor</option>
                  </select>
                </Celda>
                <Celda className="num">{fecha(m.creado_en)}</Celda>
                <Celda>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {/* La propia se cambia en Mi cuenta, que sí pide la
                        anterior; restablecerse a uno mismo saltaría esa
                        comprobación. */}
                    {!soyYo && (
                      <button
                        onClick={() => restablecer(m)}
                        disabled={cargando}
                        className="rounded-full border border-line-strong px-2.5 py-1 text-[12px] font-semibold transition hover:bg-canvas disabled:opacity-50"
                        title="Genera una contraseña temporal para dictársela"
                      >
                        {ocupado === `${m.id}-clave` ? "…" : "Restablecer clave"}
                      </button>
                    )}
                    {!soyYo && (
                      <button
                        onClick={() => actualizar(m.id, { activo: !m.activo }, `${m.id}-act`)}
                        disabled={cargando}
                        className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition disabled:opacity-50 ${
                          m.activo
                            ? "border-line-strong text-bad hover:bg-bad-bg"
                            : "border-ok text-ok hover:bg-ok-bg"
                        }`}
                      >
                        {cargando ? "…" : m.activo ? "Bloquear" : "Desbloquear"}
                      </button>
                    )}
                  </div>
                </Celda>
              </tr>
            );
          })}
        </Tabla>
        <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
      </div>

      <p className="mt-3 text-[12px] text-ink-3">
        Los <b>conductores</b> usan la app de reparto; los <b>planificadores</b>{" "}
        arman las rutas; los <b>administradores</b> además gestionan los usuarios.
        Bloquear a alguien le corta el acceso al instante sin borrar su historial.
      </p>
    </div>
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
          className="mt-3 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[13px] font-semibold transition hover:bg-canvas"
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
          className="rounded-full border border-amber-600 bg-amber px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-amber-600 hover:text-white disabled:opacity-50">
          {enviando ? "Creando…" : "Crear usuario"}
        </button>
        <button type="button" onClick={onCerrar}
          className="rounded-full border border-line-strong bg-surface px-4 py-2 text-[13px] font-semibold transition hover:bg-canvas">
          Cancelar
        </button>
      </div>
    </form>
  );
}
