"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Pastilla, Tarjeta } from "@/components/ui";

export type DetalleOrg = {
  empresa: {
    id: string;
    nombre: string;
    activa: boolean;
    suspendida_en: string | null;
    nota: string | null;
    creado_en: string;
  };
  usuarios: {
    id: string;
    nombre: string | null;
    email: string | null;
    rol: string;
    activo: boolean;
    creado_en: string;
  }[];
  totales: {
    despachos: number;
    paradas: number;
    zonas: number;
    vehiculos: number;
    entregadas: number;
    ultima: string | null;
  };
  meses: { mes: string; despachos: number; paradas: number }[];
};

const ROL_TEXTO: Record<string, string> = {
  admin: "Administrador",
  planificador: "Planificador",
  conductor: "Conductor",
};

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const mesLargo = (m: string) => {
  const [a, mm] = m.split("-").map(Number);
  return new Date(a, mm - 1, 1).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
};

export default function FichaEmpresa({ detalle }: { detalle: DetalleOrg }) {
  const router = useRouter();
  const { empresa, usuarios, totales, meses } = detalle;

  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState(empresa.nota ?? "");
  const [editandoNota, setEditandoNota] = useState(false);

  const activos = usuarios.filter((u) => u.activo);
  const porRol = (r: string) => activos.filter((u) => u.rol === r).length;
  const topeMes = Math.max(1, ...meses.map((m) => m.paradas));

  async function cambiarEstado() {
    const suspender = empresa.activa;
    if (
      suspender &&
      !window.confirm(
        `¿Suspender «${empresa.nombre}»?\n\nSus ${activos.length} usuario(s) dejarán de ver ` +
          `sus datos al instante. Nada se borra: al reactivarla vuelve todo.`,
      )
    ) {
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      const { error: fallo } = await supabase.rpc("cambiar_estado_organizacion", {
        p_org: empresa.id,
        p_activa: !empresa.activa,
        p_nota: null,
      });
      if (fallo) throw fallo;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function guardarNota() {
    setOcupado(true);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      const { error: fallo } = await supabase
        .from("organizaciones")
        .update({ nota: nota.trim() || null })
        .eq("id", empresa.id);
      if (fallo) throw fallo;
      setEditandoNota(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2 text-[12.5px] text-bad">
          {error}
        </p>
      )}

      {/* Estado de la cuenta */}
      <Tarjeta className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
              Cliente desde
            </div>
            <div className="num mt-0.5 text-[15px] font-bold">{fecha(empresa.creado_en)}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
              Última actividad
            </div>
            <div className="num mt-0.5 text-[15px] font-bold">{fecha(totales.ultima)}</div>
          </div>
          {!empresa.activa && empresa.suspendida_en && (
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                Suspendida desde
              </div>
              <div className="num mt-0.5 text-[15px] font-bold text-bad">
                {fecha(empresa.suspendida_en)}
              </div>
            </div>
          )}
          <button
            onClick={cambiarEstado}
            disabled={ocupado}
            className={`ml-auto rounded-[9px] border px-3.5 py-2 text-[13px] font-semibold transition disabled:opacity-50 ${
              empresa.activa
                ? "border-line-strong text-bad hover:bg-bad-bg"
                : "border-ok/40 text-ok hover:bg-ok-bg"
            }`}
          >
            {ocupado ? "…" : empresa.activa ? "Suspender servicio" : "Reactivar servicio"}
          </button>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
            Nota interna
          </div>
          {editandoNota ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. plan anual, factura el 5 de cada mes"
                className="min-w-[240px] flex-1 rounded-[9px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px]"
              />
              <button
                onClick={guardarNota}
                disabled={ocupado}
                className="rounded-[9px] border border-amber-600 bg-amber px-3 py-1.5 text-[12.5px] font-semibold text-navy-900 disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                onClick={() => { setEditandoNota(false); setNota(empresa.nota ?? ""); }}
                className="rounded-[9px] border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditandoNota(true)}
              className="mt-1 block text-left text-[13px] text-ink-2 hover:text-ink"
            >
              {empresa.nota || <span className="text-ink-3">Sin nota · toca para escribir una</span>}
            </button>
          )}
        </div>
      </Tarjeta>

      {/* Uso */}
      <div className="grid gap-3 @2xl:grid-cols-[1fr_1fr]">
        <Tarjeta className="p-4">
          <h3 className="mb-2.5 text-[13.5px] font-bold">Uso del servicio</h3>
          <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-3">
            <Dato etiqueta="Ruteos" valor={totales.despachos} />
            <Dato etiqueta="Paradas" valor={totales.paradas} />
            <Dato etiqueta="Entregadas" valor={totales.entregadas} />
            <Dato etiqueta="Zonas" valor={totales.zonas} />
            <Dato etiqueta="Vehículos" valor={totales.vehiculos} />
            <Dato etiqueta="Usuarios" valor={activos.length} />
          </div>

          <h4 className="mb-2 mt-4 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
            Paradas por mes
          </h4>
          <div className="flex items-end gap-1.5" style={{ height: 90 }}>
            {meses.map((m) => (
              <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[10px] text-ink-3">
                  {m.paradas > 0 ? m.paradas : ""}
                </span>
                <div
                  className="w-full rounded-t-[3px] bg-amber"
                  style={{ height: `${Math.round((m.paradas / topeMes) * 60)}px`, minHeight: 2 }}
                  title={`${m.paradas} paradas · ${m.despachos} ruteos`}
                />
                <span className="text-[10px] text-ink-3">{mesLargo(m.mes)}</span>
              </div>
            ))}
          </div>
        </Tarjeta>

        {/* Equipo de la empresa */}
        <Tarjeta className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <h3 className="text-[13.5px] font-bold">Su equipo</h3>
            <span className="text-[11.5px] text-ink-3">
              {porRol("admin")} admin · {porRol("planificador")} planif. · {porRol("conductor")} choferes
            </span>
          </div>
          {usuarios.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-warn">
              Esta empresa no tiene ningún usuario: nadie puede entrar todavía.
            </p>
          ) : (
            <div className="max-h-[280px] overflow-y-auto">
              {usuarios.map((u) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-2.5 border-b border-line px-4 py-2 last:border-0 ${
                    u.activo ? "" : "opacity-55"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">{u.nombre ?? "—"}</div>
                    <div className="num truncate text-[11.5px] text-ink-3">{u.email}</div>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-ink-2">
                    {ROL_TEXTO[u.rol] ?? u.rol}
                  </span>
                  {!u.activo && <Pastilla tono="plan">inactivo</Pastilla>}
                </div>
              ))}
            </div>
          )}
          <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
            El equipo lo gestiona el administrador de la empresa desde su panel.
          </p>
        </Tarjeta>
      </div>

      <p className="text-[11.5px] text-ink-3">
        Aquí no aparecen las tiendas, las rutas ni las entregas de {empresa.nombre}:
        para administrar el servicio no hace falta ver los clientes de tu cliente.
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div>
      <div className="num text-[20px] font-bold leading-none">
        {Number(valor).toLocaleString("es-PE")}
      </div>
      <div className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3">
        {etiqueta}
      </div>
    </div>
  );
}
