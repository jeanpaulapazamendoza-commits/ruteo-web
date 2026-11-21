"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  guardarCliente,
  type ClienteFicha,
  type EntregaCliente,
} from "@/app/acciones/clientes";
import { Paginacion, usePaginas } from "@/components/Paginacion";
import { Celda, Tabla } from "@/components/ui";
import { fecha, hora } from "@/lib/horas";

const MapaEstadisticas = dynamic(() => import("@/components/MapaEstadisticas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
  ),
});

/**
 * La ficha de un cliente, con la disposición de la referencia.
 *
 * Arriba, dos tarjetas iguales de 400 px: sus datos a la izquierda y el mapa
 * a la derecha. Debajo, cómo se le ha respondido en cuatro cifras de color, y
 * la tabla con cada vez que se le fue a repartir. Cuando reclama por
 * teléfono, lo que hay que poder decir es «de las nueve veces que fuimos,
 * fallamos dos, y la última fue el martes».
 */
const BORDE = "#a3b5d1";
const VALOR = "#546884";
const GRIS = "#6c757d";

const ESTADO: Record<string, { texto: string; color: string }> = {
  entregado: { texto: "Entregado", color: "#00875a" },
  parcial: { texto: "Entrega parcial", color: "#d97706" },
  reprogramado: { texto: "Reprogramado", color: "#d97706" },
  fallido: { texto: "No entregado", color: "#de350b" },
  pendiente: { texto: "Pendiente", color: "#5f6b7c" },
};

function duracion(min: number | null) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.round(Math.abs(min) % 60);
  const signo = min < 0 ? "−" : "+";
  return h > 0 ? `${signo}${h} h ${m} min` : `${signo}${m} min`;
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

export default function FichaCliente({
  cliente,
  historial,
  editable,
}: {
  cliente: ClienteFicha;
  historial: EntregaCliente[];
  /** El conductor ve la ficha pero no la cambia. */
  editable: boolean;
}) {
  const ubicado = cliente.lat !== null && cliente.lon !== null;
  const { pagina, setPagina, total, visibles } = usePaginas(historial, 15);

  return (
    <div className="sin-panel">
      <div className="px-5 pt-4 text-ink">
        <div className="flex min-h-[40px] items-center gap-4 pb-4">
          <Link
            href="/clientes"
            title="Volver a Clientes"
            aria-label="Volver a Clientes"
            className="text-[20px] leading-none text-ink-2 transition hover:text-ink"
          >
            ←
          </Link>
          <h1 className="text-[22px] font-bold leading-[28px] text-ink-2">Detalles del cliente</h1>
        </div>

        {/* Datos y mapa, dos tarjetas iguales */}
        <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
          <Datos cliente={cliente} editable={editable} />

          <div className="relative h-[400px] overflow-hidden rounded-[4px] bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.15)]">
            {ubicado ? (
              <MapaEstadisticas
                puntos={[
                  {
                    id: cliente.id,
                    nombre: cliente.nombre,
                    lat: cliente.lat!,
                    lon: cliente.lon!,
                    estado: "entregado",
                    hora: null,
                    conductor: null,
                    subestado: null,
                    placa: null,
                    puntual: "No definido",
                  },
                ]}
                desde={0}
                hasta={24}
              />
            ) : (
              <div className="grid h-full place-items-center bg-[#dddddd] text-[13px] text-ink-2">
                Sin coordenadas
              </div>
            )}
            {!ubicado && (
              <span
                className="absolute right-0 top-0 z-[500] rounded-bl-[4px] px-3 py-1 text-[14px] font-medium text-white"
                style={{ background: "#e80504" }}
              >
                Dirección no geolocalizada
              </span>
            )}
          </div>
        </div>

        {/* Cómo se le ha respondido */}
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4 border-b p-5" style={{ borderColor: "#dee2e6" }}>
          <div className="flex gap-2">
            {/* Cumplimiento es lo gestionado, con el resultado que sea;
                Entregado es solo lo que llegó conforme. */}
            <Cifra
              valor={`${pct(cliente.entregadas + cliente.parciales + cliente.fallidas, cliente.ordenes)}%`}
              texto="Cumplimiento"
              color="#007bff"
            />
            <Cifra valor={`${pct(cliente.entregadas, cliente.ordenes)}%`} texto="Entregado" color="#28a745" />
            <Cifra valor={`${pct(cliente.parciales, cliente.ordenes)}%`} texto="Parciales" color="#ffc107" />
            <Cifra valor={`${pct(cliente.fallidas, cliente.ordenes)}%`} texto="No entregado" color="#dc3545" />
          </div>

          {/* En la referencia este hueco lo ocupan las reseñas del
              destinatario. Aquí no las hay, así que van cuatro datos que sí
              se saben, con la misma letra. */}
          <div className="ml-auto flex flex-wrap gap-5">
            <Dato texto="Órdenes" valor={String(cliente.ordenes)} />
            <Dato texto="Bultos" valor={String(cliente.bultos)} />
            <Dato texto="Desvío medio" valor={duracion(cliente.desvio_medio)} />
            <Dato texto="Última entrega" valor={cliente.ultima ? fecha(cliente.ultima) : "—"} />
          </div>
        </div>

        {/* Cada vez que se le fue a repartir */}
        <div className="mt-5 overflow-hidden rounded-[3px] bg-surface [&>div:first-child]:rounded-none [&>div:first-child]:border-0">
          <Tabla cabeceras={["Guía", "Dirección", "Estimado en", "Real", "Estado"]} anchoMin={760}>
            {visibles.map((h) => (
              <tr key={h.parada_id} className="hover:bg-surface-2">
                <Celda>
                  <Link href={`/paradas/${h.parada_id}`}>
                    {h.despacho ?? "Despacho"}
                    {h.ruta_indice !== null && (
                      <span className="num"> · R-{String(h.ruta_indice + 1).padStart(2, "0")}</span>
                    )}
                  </Link>
                </Celda>
                <Celda>{cliente.direccion ?? cliente.distrito ?? "—"}</Celda>
                <Celda className="num">
                  {h.fecha}
                  {h.eta && <div className="font-bold">{h.eta.slice(0, 5)}</div>}
                </Celda>
                <Celda className="num">
                  {h.hora_entrega ? hora(h.hora_entrega) : "—"}
                  {h.desvio_min !== null && (
                    <div className={h.desvio_min > 15 ? "text-bad" : ""}>{duracion(h.desvio_min)}</div>
                  )}
                </Celda>
                <Celda>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex h-6 items-center rounded-[16px] border-2 bg-surface px-3 text-[12px] text-ink"
                      style={{ borderColor: ESTADO[h.estado_entrega]?.color ?? "#5f6b7c" }}
                    >
                      {ESTADO[h.estado_entrega]?.texto ?? h.estado_entrega}
                    </span>
                    {(h.subestado || h.motivo) && (
                      <span className="text-[12px]">{h.subestado ?? h.motivo}</span>
                    )}
                  </div>
                </Celda>
              </tr>
            ))}
          </Tabla>

          {historial.length === 0 ? (
            <p className="py-[110px] text-center text-[18px] font-medium text-[#2d2926]">
              No se han encontrado resultados
            </p>
          ) : (
            <Paginacion pagina={pagina} total={total} onCambio={setPagina} />
          )}
        </div>
      </div>
    </div>
  );
}

function Cifra({ valor, texto, color }: { valor: string; texto: string; color: string }) {
  return (
    <div className="w-[91px] text-center">
      <div className="num text-[24px] font-bold leading-[31px]" style={{ color }}>
        {valor}
      </div>
      <div className="text-[14px] leading-[18px]" style={{ color: GRIS }}>
        {texto}
      </div>
    </div>
  );
}

function Dato({ texto, valor }: { texto: string; valor: string }) {
  return (
    <div className="min-w-[110px] text-center">
      <div className="text-[14px] leading-[18px]" style={{ color: GRIS }}>
        {texto}
      </div>
      <div className="num pt-1 text-[16px] font-bold leading-[24px]" style={{ color: VALOR }}>
        {valor}
      </div>
    </div>
  );
}

/**
 * La tarjeta de datos, que se edita en el sitio.
 *
 * El nombre, la dirección y el teléfono los vuelve a escribir cada archivo
 * que se carga, porque de ahí vienen; lo que se escriba aquí a mano en esos
 * campos durará hasta la siguiente carga. El contacto, las notas y la marca
 * de punto fijo solo existen aquí y no los toca ninguna importación.
 */
function Datos({ cliente, editable }: { cliente: ClienteFicha; editable: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inicial = {
    nombre: cliente.nombre,
    direccion: cliente.direccion ?? "",
    telefono: cliente.telefono ?? "",
    email: cliente.email ?? "",
    contacto: cliente.contacto ?? "",
    notas: cliente.notas ?? "",
    recurrente: cliente.recurrente,
  };
  const [campos, setCampos] = useState(inicial);

  async function guardar(cambios = campos) {
    setGuardando(true);
    setError(null);
    try {
      await guardarCliente(cliente.id, cambios);
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const pon = (k: keyof typeof campos) => (v: string) => setCampos({ ...campos, [k]: v });

  return (
    <div className="h-[400px] overflow-y-auto rounded-[4px] bg-surface px-6 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.15)]">
      <div className="mb-3 flex items-center border-b pb-3" style={{ borderColor: BORDE }}>
        <h2 className="flex-1 text-[16px] font-bold leading-[21px] text-black">Detalles</h2>
        {editable && !editando && (
          <button
            onClick={() => setEditando(true)}
            title="Editar"
            aria-label="Editar"
            className="grid h-7 w-7 place-items-center rounded-full text-[13px] text-white transition hover:brightness-95"
            style={{ background: "#23c6c8" }}
          >
            ✎
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-8">
        <Campo rotulo="Nombre" valor={campos.nombre} editando={editando} onCambio={pon("nombre")} />
        <Campo rotulo="ID de Cliente" valor={cliente.codigo} mono />
        <Campo
          rotulo="Teléfono"
          valor={campos.telefono}
          editando={editando}
          onCambio={pon("telefono")}
          enlace={cliente.telefono ? `tel:${cliente.telefono}` : undefined}
          mono
        />
        <Campo
          rotulo="Correo Electrónico"
          valor={campos.email}
          editando={editando}
          onCambio={pon("email")}
          enlace={cliente.email ? `mailto:${cliente.email}` : undefined}
        />
        <Campo rotulo="Dirección" valor={campos.direccion} editando={editando} onCambio={pon("direccion")} />
        <Campo rotulo="Contacto" valor={campos.contacto} editando={editando} onCambio={pon("contacto")} />
        <div className="col-span-2">
          <Campo rotulo="Notas" valor={campos.notas} editando={editando} onCambio={pon("notas")} />
        </div>
      </div>

      <label
        className={`flex items-center gap-3 pt-1 text-[16px] ${editable ? "cursor-pointer" : ""}`}
        style={{ color: campos.recurrente ? VALOR : "#b6c0cf" }}
      >
        <input
          type="checkbox"
          checked={campos.recurrente}
          disabled={!editable || guardando}
          onChange={(e) => {
            const nuevo = { ...campos, recurrente: e.target.checked };
            setCampos(nuevo);
            // Fuera de edición se guarda en el momento: es una casilla, no un
            // formulario, y esperaría uno que quedase marcada al soltarla.
            if (!editando) void guardar({ ...inicial, recurrente: e.target.checked });
          }}
          className="h-[18px] w-[18px] accent-amber"
        />
        Cliente recurrente / dirección fija
      </label>

      {error && <p className="pt-2 text-[13px] text-bad">{error}</p>}

      {editando && (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <button
            onClick={() => void guardar()}
            disabled={guardando || !campos.nombre.trim()}
            className="h-8 rounded-full bg-amber px-4 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            onClick={() => { setCampos(inicial); setEditando(false); setError(null); }}
            className="h-8 rounded-full border border-line-strong bg-surface px-4 text-[14px] font-bold text-ink transition hover:bg-surface-2"
          >
            Cancelar
          </button>
          <span className="text-[11px] text-ink-3">
            Nombre, teléfono y dirección los reescribe la siguiente carga.
          </span>
        </div>
      )}
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  editando = false,
  onCambio,
  enlace,
  mono = false,
}: {
  rotulo: string;
  valor: string;
  editando?: boolean;
  onCambio?: (v: string) => void;
  enlace?: string;
  mono?: boolean;
}) {
  let contenido: ReactNode = valor || "-";
  if (enlace && valor) {
    contenido = (
      <a href={enlace} className="hover:underline">
        {valor}
      </a>
    );
  }

  return (
    <div className="min-h-[40px] pb-[10px]">
      <span className="block text-[12px] font-medium leading-[16px] text-black">{rotulo}</span>
      {editando && onCambio ? (
        <input
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          className="mt-0.5 h-8 w-full rounded-[4px] border border-line bg-surface px-2 text-[14px] text-ink outline-none focus:border-amber"
        />
      ) : (
        <span
          className={`block break-words text-[16px] leading-[21px] ${mono ? "num" : ""}`}
          style={{ color: VALOR }}
        >
          {contenido}
        </span>
      )}
    </div>
  );
}
