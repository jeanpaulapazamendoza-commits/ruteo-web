"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  bloquearParada,
  borrarComentario,
  comentar,
  comentarios as traerComentarios,
  subestados as traerSubestados,
  type Comentario,
  type Evento,
  type Item,
  type ParadaFicha,
} from "@/app/acciones/datos";
import {
  borrarDocumento,
  documentosDeParada,
  guardarDocumento,
  verDocumento,
} from "@/app/acciones/documentos";
import { verFoto } from "@/app/acciones/fotos";
import { pesa, TIPOS_DOCUMENTO, type Documento } from "@/lib/documentos";
import { marcarParada, type EstadoEntrega } from "@/lib/entregas";
import { fechaHora, hora } from "@/lib/horas";

const MapaSeguimiento = dynamic(() => import("@/components/MapaSeguimiento"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-[13px] text-ink-3">Cargando mapa…</div>
  ),
});

/**
 * La ficha de una orden, con la disposición de la referencia.
 *
 * A la izquierda lo que la orden *es*: a quién va, sus documentos, los
 * campos del archivo, sus artículos y lo que se ha comentado. A la derecha lo
 * que le *ha pasado*, del final hacia el principio, sobre una línea: cuándo
 * entró, cuándo salió el vehículo, cuándo llegó y con qué prueba.
 *
 * Las medidas son las de allí: columna izquierda de 411 px con tarjetas de
 * relleno 20, títulos de 22 px, rótulos de 12 y valores de 16; a la derecha,
 * tarjetas con borde #a3b5d1 y radio 4 colgadas de la línea.
 */
const TEXTO = "#676a6c";
const BORDE = "#a3b5d1";
const AZUL = "#4b82fa";
const AZUL_TINTA = "#1f60ed";

const ESTADO: Record<string, { texto: string; color: string }> = {
  entregado: { texto: "Entregado", color: "#00875a" },
  parcial: { texto: "Entrega parcial", color: "#d97706" },
  reprogramado: { texto: "Reprogramado", color: "#d97706" },
  fallido: { texto: "No entregado", color: "#de350b" },
  pendiente: { texto: "Pendiente", color: "#5f6b7c" },
};

/** El título de cada paso de la línea, según lo que se marcó. */
const PASO: Record<string, string> = {
  entregado: "Llegó a su destino",
  parcial: "Llegó a su destino",
  fallido: "No se pudo entregar",
  reprogramado: "Reprogramada",
  pendiente: "Devuelta a pendiente",
  ruta_iniciada: "En ruta a destino",
  ruta_terminada: "Ruta terminada",
};

const BOTON = "inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-[14px] font-bold transition disabled:opacity-50";

/** «sábado 21 de noviembre de 2026», a partir del día suelto del despacho. */
function diaEscrito(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Distancia en metros, para comparar el GPS con el punto planificado. */
function metros(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function FichaParada({
  parada: p,
  historial,
  items,
  rol,
}: {
  parada: ParadaFicha;
  historial: Evento[];
  items: Item[];
  /** Quién mira: desbloquear una orden es cosa de un administrador. */
  rol: "admin" | "planificador" | "conductor";
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const codigo = p.codigo ?? p.id.slice(0, 8);
  const puedeEscribir = rol !== "conductor";
  const marcada = p.estado_entrega !== "pendiente";

  async function ejecutar(accion: () => Promise<unknown>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  function limpiar() {
    // Devolverla a pendiente borra de la vista el resultado y su prueba; el
    // registro de lo que se marcó sigue en el historial, que no se reescribe.
    if (!window.confirm("¿Devolver esta orden a pendiente? El resultado marcado deja de contar; el historial lo conserva.")) {
      return;
    }
    void ejecutar(() => marcarParada({ parada_id: p.id, estado: "pendiente" }));
  }

  return (
    <div className="sin-panel">
      <div className="px-5 pt-4" style={{ color: TEXTO }}>
        {/* Cabecera: de dónde se viene, el código y las acciones */}
        <div className="flex min-h-[40px] flex-wrap items-center gap-2 pb-4">
          <h1 className="flex min-w-0 items-center gap-2 text-[22px] font-bold leading-[30px]">
            <Link href="/ordenes" className="underline" style={{ color: BORDE }}>
              Órdenes
            </Link>
            <span style={{ color: "#546884" }}>&gt;</span>
            <span className="num truncate text-ink">#{codigo}</span>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(codigo).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                });
              }}
              title="Copiar el código"
              aria-label="Copiar el código"
              className="text-[15px] transition hover:brightness-90"
              style={{ color: AZUL }}
            >
              {copiado ? "✓" : "⧉"}
            </button>
          </h1>

          {puedeEscribir && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {marcada && !p.bloqueada && (
                <button
                  onClick={limpiar}
                  disabled={ocupado}
                  className={`${BOTON} text-white hover:brightness-95`}
                  style={{ background: "#ff5630" }}
                >
                  ✕ Limpiar orden
                </button>
              )}

              {p.bloqueada ? (
                <button
                  onClick={() => void ejecutar(() => bloquearParada(p.id, false))}
                  disabled={ocupado || rol !== "admin"}
                  title={rol !== "admin" ? "Solo un administrador puede desbloquearla" : undefined}
                  className={`${BOTON} border bg-surface hover:bg-amber-050`}
                  style={{ borderColor: AZUL_TINTA, color: AZUL }}
                >
                  🔓 Desbloquear orden
                </button>
              ) : (
                marcada && (
                  <button
                    onClick={() => void ejecutar(() => bloquearParada(p.id, true))}
                    disabled={ocupado}
                    className={`${BOTON} border bg-surface hover:bg-amber-050`}
                    style={{ borderColor: AZUL_TINTA, color: AZUL }}
                  >
                    🔒 Bloquear orden
                  </button>
                )
              )}

              <Link
                href={`/despachos/${p.despacho_id}`}
                className={`${BOTON} border bg-surface hover:bg-amber-050`}
                style={{ borderColor: AZUL_TINTA, color: AZUL }}
              >
                Ver planificación
              </Link>

              <button
                onClick={() => setModal(true)}
                disabled={ocupado || p.bloqueada}
                title={p.bloqueada ? "Desbloquéala antes de cambiar su estado" : undefined}
                className={`${BOTON} bg-amber text-white hover:bg-amber-600`}
              >
                Modificar estado
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="mb-3 rounded-[4px] border border-bad/40 bg-bad-bg px-3 py-2 text-[13px] text-bad">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 items-start gap-[30px] @4xl:grid-cols-[411px_1fr]">
          {/* Lo que la orden es */}
          <div className="min-w-0 space-y-5">
            <Resumen parada={p} />
            <Documentos paradaId={p.id} />
            {Object.keys(p.extra).length > 0 && <CamposPersonalizados extra={p.extra} />}
            {items.length > 0 && <Articulos items={items} />}
            <Comentarios paradaId={p.id} />
          </div>

          {/* Lo que le ha pasado */}
          <LineaDeVida parada={p} historial={historial} items={items} />
        </div>
      </div>

      {modal && (
        <ModalEstado
          parada={p}
          onCerrar={() => setModal(false)}
          onHecho={() => {
            setModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Piezas de la columna izquierda ───────────────────────────────── */

/** Tarjeta blanca plegable, con su título de 22 px. */
function Caja({
  titulo,
  children,
  abiertaAlInicio = true,
}: {
  titulo: ReactNode;
  children: ReactNode;
  abiertaAlInicio?: boolean;
}) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  return (
    <section className="bg-surface p-5 shadow-[0_4px_8px_rgba(0,0,0,0.15)]">
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center text-left"
      >
        <span className="flex-1 text-[22px] font-medium leading-[29px] text-ink-2">{titulo}</span>
        <span
          className={`grid h-6 w-6 place-items-center rounded-full text-[11px] text-ink-2 transition-transform ${
            abierta ? "" : "rotate-180"
          }`}
        >
          ⌃
        </span>
      </button>
      {abierta && <div className="pt-[10px]">{children}</div>}
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="pb-[10px]">
      <div className="text-[12px] font-medium leading-[16px] text-ink">{rotulo}</div>
      <div className="break-words text-[16px] leading-[21px]">{children}</div>
    </div>
  );
}

function PildoraEstado({ estado }: { estado: string }) {
  const e = ESTADO[estado] ?? { texto: estado, color: "#5f6b7c" };
  return (
    <span
      className="inline-flex h-6 items-center rounded-[16px] border-2 bg-surface px-3 text-[12px] text-ink"
      style={{ borderColor: e.color }}
    >
      {e.texto}
    </span>
  );
}

function Resumen({ parada: p }: { parada: ParadaFicha }) {
  return (
    <Caja titulo="Resumen">
      <Campo rotulo="Nombre">
        {p.cliente_id ? (
          <Link href={`/clientes/${p.cliente_id}`} className="underline" style={{ color: AZUL_TINTA }}>
            {p.nombre ?? "Sin nombre"}
          </Link>
        ) : (
          (p.nombre ?? "Sin nombre")
        )}
      </Campo>
      <Campo rotulo="Identificador de contacto">
        <span className="num">{p.codigo ?? "—"}</span>
      </Campo>
      <Campo rotulo="Teléfono">
        {p.cliente_telefono ? (
          <a href={`tel:${p.cliente_telefono}`} className="num hover:underline">
            {p.cliente_telefono}
          </a>
        ) : (
          "—"
        )}
      </Campo>
      <Campo rotulo="Dirección">{p.cliente_direccion ?? p.distrito ?? "—"}</Campo>

      {/* Toda orden entra con coordenadas: sin ellas el archivo no se carga. */}
      <div
        className="mb-[14px] flex items-center gap-2.5 rounded-[5px] px-5 py-2 text-[13px]"
        style={{ background: "#e3fcef", color: "#00875a" }}
      >
        <span className="grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] text-white" style={{ background: "#00875a" }}>
          ✓
        </span>
        Dirección geolocalizada exitosamente
      </div>

      <Campo rotulo="Vehículo y conductor">
        <span className="num">{p.placa ?? `R-${String(p.ruta_indice + 1).padStart(2, "0")}`}</span>
        {" · "}
        {p.conductor ?? "sin asignar"}
      </Campo>
      <Campo rotulo="Núm. Intentos">
        <span className="num">{p.intentos}</span>
      </Campo>
      <div>
        <div className="pb-1 text-[12px] font-medium leading-[16px] text-ink">Último estado</div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink">
          <PildoraEstado estado={p.estado_entrega} />
          {p.subestado ?? p.motivo ?? (p.estado_entrega === "entregado" ? "Entregado" : "")}
          {p.bloqueada && <span className="text-ink-3">· 🔒 bloqueada</span>}
        </div>
      </div>
    </Caja>
  );
}

/**
 * Los documentos de la orden.
 *
 * El archivo no se guarda aquí: va al almacén y de él queda una fila con su
 * clave. Se abre con una URL firmada que caduca a los diez minutos, porque un
 * documento de un cliente no debe quedar colgando de un enlace eterno.
 */
function Documentos({ paradaId }: { paradaId: string }) {
  const [lista, setLista] = useState<Documento[]>([]);
  const [tipo, setTipo] = useState<string>(TIPOS_DOCUMENTO[0]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    documentosDeParada(paradaId)
      .then((d) => { if (vigente) setLista(d); })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vigente = false; };
  }, [paradaId]);

  async function subir() {
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      const datos = new FormData();
      datos.append("paradaId", paradaId);
      datos.append("tipo", tipo);
      datos.append("archivo", archivo);
      const nuevo = await guardarDocumento(datos);
      setLista((l) => [nuevo, ...l]);
      setArchivo(null);
      if (campo.current) campo.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function abrir(id: number) {
    setError(null);
    try {
      const url = await verDocumento(id);
      // Pestaña nueva y sin referente: el enlace firmado no debe viajar en el
      // encabezado de la siguiente página que abra el navegador.
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setError("Ese documento ya no está disponible.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function retirar(id: number) {
    setError(null);
    try {
      await borrarDocumento(id);
      setLista((l) => l.filter((d) => d.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Caja titulo="Documentos">
      {lista.length === 0 ? (
        <p className="pb-4 text-[14px]">Aún no se han agregado documentos a esta orden.</p>
      ) : (
        <ul className="mb-4 divide-y divide-line border-y border-line">
          {lista.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => void abrir(d.id)}
                  className="block max-w-full truncate text-left text-[14px] underline"
                  style={{ color: AZUL_TINTA }}
                >
                  {d.nombre}
                </button>
                <div className="num truncate text-[11px] text-ink-3">
                  {d.tipo} · {pesa(d.peso)} · {fechaHora(d.creado_en)}
                  {d.autor ? ` · ${d.autor}` : ""}
                </div>
              </div>
              {d.mio && (
                <button
                  onClick={() => void retirar(d.id)}
                  title="Retirar el documento"
                  className="px-1 text-[13px] text-ink-3 transition hover:text-bad"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="relative h-[56px] rounded-[4px] border border-line">
        <span className="pointer-events-none absolute left-[14px] top-[7px] text-[12px] text-ink-3">
          Tipo de documento
        </span>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-full w-full cursor-pointer appearance-none bg-transparent pb-[8px] pl-[14px] pr-[36px] pt-[24px] text-[16px] text-ink outline-none"
        >
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">
          ▼
        </span>
      </div>

      <div className="pb-1 pt-4 text-[14px]">Subir nuevo documento</div>
      <div className="flex items-center gap-3 rounded-[4px] border border-line p-2">
        <label
          className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full border bg-surface px-6 text-[16px] transition hover:bg-amber-050"
          style={{ borderColor: AZUL_TINTA, color: AZUL_TINTA }}
        >
          Elegir archivo
          <input
            ref={campo}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
        <span className="min-w-0 truncate text-[13px]">
          {archivo ? archivo.name : "Ningún archivo seleccionado"}
        </span>
      </div>
      <p className="pt-1 text-[11px] text-ink-3">PDF o imagen, hasta 10 MB.</p>

      {error && <p className="pt-2 text-[13px] text-bad">{error}</p>}

      <button
        onClick={() => void subir()}
        disabled={!archivo || subiendo}
        className="mt-3 inline-flex h-10 items-center rounded-full border bg-surface px-8 text-[16px] transition hover:bg-amber-050 disabled:opacity-50"
        style={{ borderColor: AZUL_TINTA, color: AZUL_TINTA }}
      >
        {subiendo ? "Subiendo…" : "Subir"}
      </button>
    </Caja>
  );
}

/**
 * Las columnas que trae el archivo del cliente y la aplicación no interpreta.
 *
 * Número de pedido, canal de venta, guía de remisión: cada empresa manda las
 * suyas. Se guardan tal cual y se muestran sin tocar el esquema por cada
 * cliente nuevo.
 */
function CamposPersonalizados({ extra }: { extra: Record<string, string> }) {
  return (
    <Caja titulo="Campos personalizados">
      {Object.entries(extra).map(([k, v]) => (
        <Campo key={k} rotulo={k.toUpperCase()}>
          {v}
        </Campo>
      ))}
    </Caja>
  );
}

/**
 * Los artículos del pedido.
 *
 * Un número de bultos dice cuánto ocupa, no qué es. Cuando el cliente
 * reclama por una cocina que no llegó, la conversación es sobre el artículo.
 */
function Articulos({ items }: { items: Item[] }) {
  return (
    <Caja titulo="Ítems">
      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="border-b border-line pb-2 last:border-b-0 last:pb-0">
            <Campo rotulo="Nombre">{i.nombre}</Campo>
            <div className="grid grid-cols-3 gap-2">
              <Campo rotulo="Código">
                <span className="num">{i.codigo ?? "—"}</span>
              </Campo>
              <Campo rotulo="Cantidad">
                <span className="num">{Number(i.cantidad)}</span>
              </Campo>
              <Campo rotulo="Precio">
                <span className="num">{i.precio != null ? Number(i.precio) : "—"}</span>
              </Campo>
            </div>
          </div>
        ))}
      </div>
    </Caja>
  );
}

function Comentarios({ paradaId }: { paradaId: string }) {
  const [lista, setLista] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recargar() {
    try {
      setLista(await traerComentarios(paradaId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let vigente = true;
    traerComentarios(paradaId)
      .then((d) => { if (vigente) setLista(d); })
      .catch((e) => { if (vigente) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vigente = false; };
  }, [paradaId]);

  async function enviar() {
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      await comentar(paradaId, texto);
      setTexto("");
      await recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  async function retirar(id: number) {
    try {
      await borrarComentario(id);
      await recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Caja titulo={`Comentarios (${lista.length})`}>
      {lista.length > 0 && (
        <ul className="mb-4 space-y-3">
          {lista.map((c) => (
            <li key={c.id} className="rounded-[4px] border border-line px-3 py-2">
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <b className="text-ink">{c.autor ?? "Alguien"}</b>
                <span className="num">{fechaHora(c.creado_en)}</span>
                {c.mio && (
                  <button
                    onClick={() => void retirar(c.id)}
                    title="Retirar el comentario"
                    className="ml-auto transition hover:text-bad"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words pt-1 text-[14px]">{c.texto}</p>
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void enviar();
        }}
        rows={3}
        maxLength={2000}
        placeholder="Tu comentario ..."
        className="w-full resize-y rounded-[4px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-amber"
      />
      <p className="pt-1 text-[11px] text-ink-3">
        Ctrl+Enter (Cmd+Enter en Mac) para agregar el comentario. Solo lo ve tu equipo.
      </p>

      {error && <p className="pt-2 text-[13px] text-bad">{error}</p>}

      <button
        onClick={() => void enviar()}
        disabled={guardando || !texto.trim()}
        className="mt-3 inline-flex h-10 items-center rounded-full bg-amber px-6 text-[16px] text-white transition hover:bg-amber-600 disabled:opacity-50"
      >
        {guardando ? "…" : "Agregar comentario"}
      </button>
    </Caja>
  );
}

/* ── La línea de vida, a la derecha ───────────────────────────────── */

function LineaDeVida({
  parada: p,
  historial,
  items,
}: {
  parada: ParadaFicha;
  historial: Evento[];
  items: Item[];
}) {
  // Llega del más reciente al más antiguo, que es como se lee aquí.
  const marcas = historial.filter((e) => e.tipo !== "ruta_iniciada" && e.tipo !== "ruta_terminada");
  const vehiculo = p.placa ?? `R-${String(p.ruta_indice + 1).padStart(2, "0")}`;

  return (
    <div className="min-w-0">
      <h3 className="pb-[10px] pl-5 text-[14px] font-bold first-letter:lowercase">
        {diaEscrito(p.fecha)}
      </h3>

      <div className="relative pl-6">
        {/* La línea de la que cuelga todo */}
        <span className="absolute bottom-0 left-[6px] top-0 w-[2px]" style={{ background: "#5a6b85" }} />

        <div className="space-y-5">
          {p.bloqueada && (
            <Paso titulo="Orden bloqueada">
              <Meta>No admite más marcas hasta que un administrador la desbloquee.</Meta>
            </Paso>
          )}

          {marcas.map((e, i) => {
            const d = e.datos as { desde?: string; corregida?: boolean; bultos_entregados?: number; motivo?: string; subestado?: string };
            const ultima = i === 0;
            return (
              <Paso key={e.id} titulo={PASO[e.tipo] ?? e.tipo}>
                <Meta>
                  <span>🕒 Registrado: <span className="num">{hora(e.ocurrido_en)}</span></span>
                  {ultima && p.desvio_min != null && (
                    <span>
                      Desvío:{" "}
                      <b className="num">
                        {p.desvio_min > 0 ? "+" : ""}
                        {p.desvio_min} minutos
                      </b>
                    </span>
                  )}
                  {e.autor && <span>👤 {e.autor}</span>}
                  <span className="num font-bold" style={{ color: AZUL }}>🚚 {vehiculo}</span>
                  <span className="ml-auto flex items-center gap-2 text-[12px] text-ink">
                    <PildoraEstado estado={e.tipo} />
                    {d.subestado ?? d.motivo ?? ""}
                  </span>
                </Meta>

                {d.corregida && d.desde && (
                  <p className="pt-1 text-[12px]" style={{ color: "#d97706" }}>
                    Corrigió lo marcado antes como «{ESTADO[d.desde]?.texto ?? d.desde}».
                  </p>
                )}

                {/* La marca vigente lleva el mapa, los ítems y la prueba. */}
                {ultima && p.estado_entrega !== "pendiente" && (
                  <>
                    <div className="mt-3 h-[200px] overflow-hidden">
                      <MapaSeguimiento
                        paradas={[
                          {
                            id: p.id,
                            orden: p.orden,
                            nombre: p.nombre,
                            lat: p.lat,
                            lon: p.lon,
                            bultos: p.bultos,
                            estado_entrega: p.estado_entrega,
                            hora_entrega: p.hora_entrega,
                            motivo: p.motivo,
                          },
                        ]}
                        geometria={null}
                        colorRuta={AZUL}
                        cd={null}
                      />
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 @3xl:grid-cols-2">
                      <SubCaja titulo="Cumplimiento de items">
                        {items.length === 0 ? (
                          <span
                            className="inline-flex h-6 items-center rounded-[16px] border-2 px-3 text-[12px] text-ink"
                            style={{ borderColor: ESTADO[p.estado_entrega]?.color ?? "#5f6b7c" }}
                          >
                            Bultos : {p.bultos_entregados ?? 0}/{p.bultos}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((it) => {
                              const hechos = Number(it.entregados ?? 0);
                              const total = Number(it.cantidad);
                              return (
                                <span
                                  key={it.id}
                                  className="inline-flex min-h-6 items-center rounded-[16px] border-2 px-3 py-0.5 text-[12px] text-ink"
                                  style={{ borderColor: hechos >= total ? "#00875a" : hechos > 0 ? "#d97706" : "#de350b" }}
                                >
                                  {it.nombre} : {hechos}/{total}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </SubCaja>

                      <SubCaja titulo="Pruebas de entrega">
                        <PruebaDeEntrega parada={p} />
                      </SubCaja>
                    </div>
                  </>
                )}
              </Paso>
            );
          })}

          {p.salida_real && (
            <Paso titulo="En ruta a destino">
              <Meta>
                <span>🕒 Registrado: <span className="num">{hora(p.salida_real)}</span></span>
                <span className="num font-bold" style={{ color: AZUL }}>🚚 {vehiculo}</span>
                {p.conductor && <span>👤 {p.conductor}</span>}
                <span className="ml-auto text-[12px] text-ink">Pendiente</span>
              </Meta>
            </Paso>
          )}

          <Paso titulo="Ingresado al sistema">
            <Meta>
              <span>🕒 Registrado: <span className="num">{fechaHora(p.ingresado_en)}</span></span>
              {p.ingresado_por && <span>👤 {p.ingresado_por}</span>}
              {p.archivo && <span className="num">📄 {p.archivo}</span>}
              <span>
                Despacho{" "}
                <Link href={`/despachos/${p.despacho_id}`} className="underline" style={{ color: AZUL_TINTA }}>
                  {p.despacho ?? "sin nombre"}
                </Link>
              </span>
            </Meta>
          </Paso>
        </div>
      </div>
    </div>
  );
}

function Paso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="relative">
      {/* El nudo sobre la línea */}
      <span
        className="absolute -left-[25px] top-[22px] h-[16px] w-[16px] rounded-full border-[3px] bg-surface"
        style={{ borderColor: AZUL }}
      />
      <div
        className="rounded-[4px] border bg-surface px-6 py-4 shadow-[0_4px_4px_rgba(0,0,0,0.15)]"
        style={{ borderColor: BORDE }}
      >
        <div className="py-[10px] text-[22px] font-medium leading-[29px] text-ink-2">{titulo}</div>
        {children}
      </div>
    </div>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-[19px]">
      {children}
    </div>
  );
}

function SubCaja({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-[4px] border px-5 pb-3 pt-5" style={{ borderColor: BORDE }}>
      <div className="pb-[10px] text-[22px] font-medium leading-[29px] text-ink">{titulo}</div>
      {children}
    </div>
  );
}

/**
 * Lo que el conductor dejó al marcar.
 *
 * Es la respuesta a «¿de verdad entregaste?»: quién recibió, qué anotó, la
 * foto y dónde estaba el móvil en ese momento.
 */
function PruebaDeEntrega({ parada: p }: { parada: ParadaFicha }) {
  const [foto, setFoto] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  const nada = !p.recibe && !p.observaciones && !p.motivo && !p.foto_url && p.gps_lat == null;

  async function abrirFoto() {
    if (!p.foto_url || foto) return;
    setPidiendo(true);
    try {
      setFoto(await verFoto(p.foto_url));
    } finally {
      setPidiendo(false);
    }
  }

  if (nada) return <p className="text-[13px]">El conductor no dejó ninguna prueba al marcar.</p>;

  return (
    <div className="space-y-2 text-[13px]">
      {p.foto_url && (
        <div>
          <div>Foto de la entrega :</div>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="Prueba de entrega" className="mt-1 max-h-[220px] rounded-[4px] border border-line" />
          ) : (
            <button
              onClick={abrirFoto}
              disabled={pidiendo}
              className="mt-1 inline-flex h-8 items-center rounded-full border bg-surface px-4 text-[14px] transition hover:bg-amber-050 disabled:opacity-50"
              style={{ borderColor: AZUL_TINTA, color: AZUL_TINTA }}
            >
              {pidiendo ? "Pidiendo…" : "Mostrar la foto"}
            </button>
          )}
        </div>
      )}
      {p.recibe && (
        <div>
          ¿Quién lo recepciona? : <b className="text-ink">{p.recibe}</b>
        </div>
      )}
      {p.motivo && (
        <div>
          Motivo : <b className="text-ink">{p.motivo}</b>
        </div>
      )}
      {p.observaciones && (
        <div>
          Observaciones : <b className="text-ink">{p.observaciones}</b>
        </div>
      )}
      {/* La distancia entre dónde debía estar y dónde estaba el móvil es la
          prueba de que se pisó el sitio, o de que no. */}
      {p.gps_lat != null && p.gps_lon != null && (
        <div>
          GPS al marcar :{" "}
          <b className="num text-ink">
            a {Math.round(metros(p.lat, p.lon, p.gps_lat, p.gps_lon))} m del punto
          </b>
        </div>
      )}
    </div>
  );
}

/* ── Modificar estado ─────────────────────────────────────────────── */

const ELEGIBLES: EstadoEntrega[] = ["entregado", "parcial", "fallido", "reprogramado"];

/**
 * Cambiar el estado desde la oficina.
 *
 * Pasa por la misma función que usa el conductor: así queda en el historial
 * con quién lo hizo, y valen las mismas reglas —un fallo necesita motivo, una
 * entrega parcial necesita cuántos bultos—.
 */
function ModalEstado({
  parada: p,
  onCerrar,
  onHecho,
}: {
  parada: ParadaFicha;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [estado, setEstado] = useState<EstadoEntrega>(
    ELEGIBLES.includes(p.estado_entrega as EstadoEntrega) ? (p.estado_entrega as EstadoEntrega) : "entregado",
  );
  const [motivos, setMotivos] = useState<string[]>([]);
  const [subestado, setSubestado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [bultos, setBultos] = useState(String(p.bultos_entregados ?? p.bultos));
  const [recibe, setRecibe] = useState(p.recibe ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    traerSubestados()
      .then((todos) => {
        if (vigente) setMotivos(todos.filter((s) => s.estado === estado).map((s) => s.texto));
      })
      .catch(() => { if (vigente) setMotivos([]); });
    return () => { vigente = false; };
  }, [estado]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await marcarParada({
        parada_id: p.id,
        estado,
        subestado: subestado || null,
        motivo: motivo.trim() || subestado || null,
        bultos_entregados: estado === "parcial" ? Number(bultos) : null,
        recibe: recibe.trim() || null,
      });
      onHecho();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  }

  const entrada =
    "h-10 w-full rounded-[4px] border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-amber";

  return (
    <>
      <button aria-label="Cerrar" onClick={onCerrar} className="fixed inset-0 z-40 cursor-default bg-navy-900/40" />
      <div className="fixed left-1/2 top-1/2 z-50 w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-surface p-6 shadow-2xl">
        <div className="flex items-center pb-4">
          <b className="text-[18px] text-ink">Modificar estado</b>
          <button onClick={onCerrar} aria-label="Cerrar" className="ml-auto text-[16px] text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        <div className="space-y-3 text-[13px] text-ink-2">
          <label className="block">
            Estado
            <select value={estado} onChange={(e) => { setEstado(e.target.value as EstadoEntrega); setSubestado(""); }} className={`mt-1 ${entrada}`}>
              {ELEGIBLES.map((k) => (
                <option key={k} value={k}>{ESTADO[k].texto}</option>
              ))}
            </select>
          </label>

          {motivos.length > 0 && (
            <label className="block">
              Subestado
              <select value={subestado} onChange={(e) => setSubestado(e.target.value)} className={`mt-1 ${entrada}`}>
                <option value=""></option>
                {motivos.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          )}

          {estado === "parcial" && (
            <label className="block">
              Bultos entregados, de {p.bultos}
              <input
                type="number"
                min={0}
                max={p.bultos}
                value={bultos}
                onChange={(e) => setBultos(e.target.value)}
                className={`num mt-1 ${entrada}`}
              />
            </label>
          )}

          {(estado === "entregado" || estado === "parcial") && (
            <label className="block">
              Quién recibió
              <input value={recibe} onChange={(e) => setRecibe(e.target.value)} className={`mt-1 ${entrada}`} />
            </label>
          )}

          {estado !== "entregado" && (
            <label className="block">
              {estado === "fallido" ? "Motivo" : "Detalle"}
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={subestado ? "Opcional: lo que no cabe en el subestado" : ""}
                className={`mt-1 ${entrada}`}
              />
            </label>
          )}
        </div>

        {error && <p className="pt-3 text-[13px] text-bad">{error}</p>}

        <div className="flex justify-end gap-2 pt-5">
          <button
            onClick={onCerrar}
            className="h-10 rounded-full border border-line-strong bg-surface px-6 text-[14px] font-bold text-ink transition hover:bg-surface-2"
          >
            Cancelar
          </button>
          <button
            onClick={() => void guardar()}
            disabled={guardando}
            className="h-10 rounded-full bg-amber px-6 text-[14px] font-bold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </>
  );
}
