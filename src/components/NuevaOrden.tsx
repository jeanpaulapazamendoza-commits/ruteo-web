"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buscarClientes, type ClienteHallado } from "@/app/acciones/insertar";
import { agregarOrden } from "@/lib/despachos";
import { partirEtiquetas } from "@/lib/motor";
import { Tarjeta } from "@/components/ui";

const CAMPO =
  "w-full rounded-[8px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-amber";

/** «-12.0931, -77.0465», tal como se copia de un mapa. */
function leerCoordenadas(texto: string): { lat: number; lon: number } | null {
  const m = texto.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", "."));
  const lon = Number(m[2].replace(",", "."));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * Una orden que llega con el reparto ya armado.
 *
 * Hasta ahora, añadir un punto obligaba a abrir el planificador y recalcular
 * el despacho entero, y eso deja de ser posible en cuanto sale a la calle.
 * Aquí la orden entra en la bandeja, y desde ahí se le busca hueco en una
 * ruta sin tocar lo demás.
 *
 * Las coordenadas salen de un cliente ya conocido o se pegan a mano: no hay
 * geocodificación de direcciones.
 */
export default function NuevaOrden({ despachoId }: { despachoId: string }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [busca, setBusca] = useState("");
  const [hallados, setHallados] = useState<ClienteHallado[]>([]);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [distrito, setDistrito] = useState("");
  const [telefono, setTelefono] = useState("");
  const [coords, setCoords] = useState("");
  const [bultos, setBultos] = useState("1");
  const [prioritaria, setPrioritaria] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [etiquetas, setEtiquetas] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turno = useRef(0);

  // La búsqueda espera a que se deje de escribir, y descarta las respuestas
  // que llegan tarde.
  useEffect(() => {
    const t = busca.trim();
    if (t.length < 2) return;
    const mio = ++turno.current;
    const espera = setTimeout(() => {
      buscarClientes(t)
        .then((r) => { if (mio === turno.current) setHallados(r); })
        .catch(() => { if (mio === turno.current) setHallados([]); });
    }, 250);
    return () => clearTimeout(espera);
  }, [busca]);

  function elegir(c: ClienteHallado) {
    setCodigo(c.codigo);
    setNombre(c.nombre);
    setDireccion(c.direccion ?? "");
    setDistrito(c.distrito ?? "");
    setTelefono(c.telefono ?? "");
    setCoords(`${c.lat}, ${c.lon}`);
    setBusca("");
    setHallados([]);
  }

  const punto = leerCoordenadas(coords);
  const ventanaMal = Boolean(desde) !== Boolean(hasta) || (desde && hasta && hasta <= desde);
  const lista = nombre.trim() && punto && !ventanaMal && Number(bultos) >= 0;

  async function guardar() {
    if (!lista || !punto) return;
    setOcupado(true);
    setError(null);
    try {
      const pide = partirEtiquetas(etiquetas);
      await agregarOrden(despachoId, {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        direccion: direccion.trim() || null,
        distrito: distrito.trim() || null,
        telefono: telefono.trim() || null,
        lat: punto.lat,
        lon: punto.lon,
        bultos: Math.max(0, Math.round(Number(bultos) || 0)),
        prioridad: prioritaria ? 1 : 0,
        ventana_ini: desde || null,
        ventana_fin: hasta || null,
        extra: pide.length ? { etiquetas: pide.join(", ") } : {},
      });
      setAbierta(false);
      setCodigo(""); setNombre(""); setDireccion(""); setDistrito(""); setTelefono("");
      setCoords(""); setBultos("1"); setPrioritaria(false); setDesde(""); setHasta("");
      setEtiquetas("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  if (!abierta) {
    return (
      <button
        onClick={() => setAbierta(true)}
        className="self-start rounded-full border border-line-strong bg-surface px-4 py-2 text-[12.5px] font-semibold transition hover:bg-canvas"
      >
        ＋ Añadir una orden a este despacho
      </button>
    );
  }

  return (
    <Tarjeta className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <h3 className="text-[13.5px] font-bold">Nueva orden</h3>
        <span className="text-[12px] text-ink-2">
          Entra en la bandeja; después se le busca hueco en una ruta.
        </span>
        <button
          onClick={() => setAbierta(false)}
          className="ml-auto text-[12.5px] text-ink-2 transition hover:text-ink"
        >
          Cancelar
        </button>
      </div>

      <div className="@container"><div className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 @2xl:grid-cols-2 @4xl:grid-cols-4">
        <label className="relative block @2xl:col-span-2 @4xl:col-span-4">
          <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">
            Buscar un cliente conocido (rellena lo demás)
          </span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nombre o código"
            className={CAMPO}
          />
          {busca.trim().length >= 2 && hallados.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[8px] border border-line-strong bg-surface shadow-lg">
              {hallados.map((c) => (
                <button
                  key={c.codigo}
                  type="button"
                  onClick={() => elegir(c)}
                  className="block w-full border-b border-line px-3 py-1.5 text-left text-[12.5px] last:border-0 hover:bg-canvas"
                >
                  <b>{c.nombre}</b>{" "}
                  <span className="num text-ink-3">
                    {c.codigo}
                    {c.distrito ? ` · ${c.distrito}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </label>

        <Campo rotulo="Nombre *">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
        </Campo>
        <Campo rotulo="Código">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={CAMPO} />
        </Campo>
        <Campo rotulo="Coordenadas * (latitud, longitud)" aviso={coords && !punto ? "No se entienden" : null}>
          <input
            value={coords}
            onChange={(e) => setCoords(e.target.value)}
            placeholder="-12.0931, -77.0465"
            className={`${CAMPO} num`}
          />
        </Campo>
        <Campo rotulo="Bultos">
          <input
            type="number" min={0} value={bultos}
            onChange={(e) => setBultos(e.target.value)}
            className={`${CAMPO} num`}
          />
        </Campo>
        <Campo rotulo="Dirección">
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={CAMPO} />
        </Campo>
        <Campo rotulo="Distrito">
          <input value={distrito} onChange={(e) => setDistrito(e.target.value)} className={CAMPO} />
        </Campo>
        <Campo rotulo="Teléfono">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={CAMPO} />
        </Campo>
        <Campo
          rotulo="Ventana horaria"
          aviso={ventanaMal ? "Pon las dos horas, y la segunda después" : null}
        >
          <span className="flex items-center gap-1.5">
            <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${CAMPO} num`} />
            <span className="text-ink-3">–</span>
            <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${CAMPO} num`} />
          </span>
        </Campo>
        <Campo rotulo="Pide del vehículo (etiquetas)">
          <input
            value={etiquetas}
            onChange={(e) => setEtiquetas(e.target.value)}
            placeholder="refrigerado, moto"
            className={CAMPO}
          />
        </Campo>
        <label className="flex items-center gap-2 self-end pb-1.5 text-[13px]">
          <input
            type="checkbox"
            checked={prioritaria}
            onChange={(e) => setPrioritaria(e.target.checked)}
          />
          Es prioritaria
        </label>
      </div></div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-4 py-2.5">
        <button
          onClick={guardar}
          disabled={!lista || ocupado}
          className="rounded-full border border-amber-600 bg-amber px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          {ocupado ? "Guardando…" : "Añadir a la bandeja"}
        </button>
        {error && <span className="text-[12.5px] text-bad">{error}</span>}
      </div>
    </Tarjeta>
  );
}

function Campo({
  rotulo,
  aviso = null,
  children,
}: {
  rotulo: string;
  aviso?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between gap-2 text-[11.5px] font-semibold text-ink-2">
        {rotulo}
        {aviso && <span className="font-normal text-bad">{aviso}</span>}
      </span>
      {children}
    </label>
  );
}
