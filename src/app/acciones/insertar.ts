"use server";

import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { ZONA } from "@/lib/horas";
import { etiquetasDe, type CuerpoInsertar, type TiendaMapa } from "@/lib/motor";

/**
 * Lo que el motor necesita para meter órdenes en rutas que ya están en la
 * calle: cómo está cada ruta ahora mismo.
 *
 * Se arma aquí, en el servidor, y no en el navegador: la posición de cada
 * vehículo, lo que le queda y la hora salen de la base en el momento de
 * pedirlo. Una pantalla abierta desde hace veinte minutos mandaría rutas que
 * ya no existen.
 *
 * No hay GPS continuo. La posición de un vehículo es la de la última parada
 * que gestionó —el GPS que capturó el móvil al marcarla, o la dirección si no
 * lo hubo—, y si aún no gestionó ninguna, el centro. Es una estimación
 * conservadora: el vehículo real va algo más adelantado.
 */
async function idSesion() {
  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");
  return sesion.user.id;
}

type ParadaCruda = {
  id: string;
  orden: number;
  codigo: string | null;
  nombre: string | null;
  lat: number;
  lon: number;
  bultos: number;
  prioridad: number;
  ventana_ini: string | null;
  ventana_fin: string | null;
  estado_entrega: string;
  hora_entrega: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  extra: Record<string, string> | null;
};

type RutaCruda = {
  id: string;
  indice: number;
  estado: string;
  salida_prog: string | null;
  salida_real: string | null;
  placa: string | null;
  conductor: string | null;
  capacidad_bultos: number | null;
  max_tiendas: number | null;
  paradas: ParadaCruda[];
};

export type PreparacionInsercion = {
  cuerpo: CuerpoInsertar;
  /** Cómo nombrar cada ruta en la propuesta. */
  rutas: Record<string, { rotulo: string; enCalle: boolean }>;
  /** Cómo nombrar cada parada: «después de …». */
  nombres: Record<string, string>;
};

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/** La hora de ahora en la zona de la operación, «HH:MM». */
function ahoraEnZona() {
  const partes = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA,
  }).formatToParts(new Date());
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return `${de("hour")}:${de("minute")}`;
}

function aTienda(p: ParadaCruda): TiendaMapa & { etiquetas: string[] } {
  const t: TiendaMapa = {
    id: p.id,
    codigo: p.codigo ?? "",
    nombre: p.nombre ?? "",
    distrito: null,
    lat: p.lat,
    lon: p.lon,
    bultos: p.bultos,
    prioridad: p.prioridad,
    ventana_ini: hhmm(p.ventana_ini),
    ventana_fin: hhmm(p.ventana_fin),
    extra: p.extra ?? {},
  };
  // Al motor solo le viaja lo que rutea.
  return {
    id: t.id, codigo: t.codigo, nombre: t.nombre, distrito: null,
    lat: t.lat, lon: t.lon, bultos: t.bultos, prioridad: t.prioridad,
    ventana_ini: t.ventana_ini, ventana_fin: t.ventana_fin,
    etiquetas: etiquetasDe(t),
  };
}

export async function prepararInsercion(
  despachoId: string,
  paradaIds: string[],
  reordenar: boolean,
): Promise<PreparacionInsercion> {
  const yo = await idSesion();
  if (!paradaIds.length) throw new Error("Elige al menos una orden.");

  const despacho = await unaFila<{
    estado: string;
    cd_lat: number | null;
    cd_lon: number | null;
    parametros: Record<string, unknown> | null;
    es_hoy: boolean;
    futuro: boolean;
  }>(
    yo,
    `select d.estado, d.cd_lat, d.cd_lon, d.parametros,
            d.fecha = private.hoy() as es_hoy, d.fecha > private.hoy() as futuro
       from despachos d where d.id = $1`,
    [despachoId],
  );
  if (!despacho) throw new Error("Ese despacho no existe.");
  if (despacho.estado === "cerrado" || despacho.estado === "anulado") {
    throw new Error("Este despacho ya está cerrado: no admite más órdenes.");
  }
  if (despacho.cd_lat == null || despacho.cd_lon == null) {
    throw new Error("Este despacho todavía no tiene rutas: ábrelo en el planificador.");
  }

  const [rutas, nuevas] = await Promise.all([
    comoUsuario<RutaCruda>(
      yo,
      `select r.id, r.indice, r.estado, r.salida_prog, r.salida_real,
              v.placa, c.nombre as conductor, v.capacidad_bultos, v.max_tiendas,
              coalesce(
                (select json_agg(x order by x.orden)
                   from (select p.id, p.orden, p.codigo, p.nombre, p.lat, p.lon,
                                p.bultos, p.prioridad, p.ventana_ini, p.ventana_fin,
                                p.estado_entrega, p.hora_entrega, p.gps_lat, p.gps_lon,
                                p.extra
                           from paradas p where p.ruta_id = r.id) x),
                '[]'::json) as paradas
         from rutas r
         left join vehiculos v on v.id = r.vehiculo_id
         left join perfiles c on c.id = r.conductor_id
        where r.despacho_id = $1 and not r.sin_asignar
          and r.estado in ('planificada', 'en_curso')
        order by r.indice`,
      [despachoId],
    ),
    comoUsuario<ParadaCruda>(
      yo,
      `select p.id, p.orden, p.codigo, p.nombre, p.lat, p.lon, p.bultos,
              p.prioridad, p.ventana_ini, p.ventana_fin, p.estado_entrega,
              p.hora_entrega, p.gps_lat, p.gps_lon, p.extra
         from paradas p
         join rutas r on r.id = p.ruta_id
        where r.despacho_id = $1 and r.sin_asignar
          and p.estado_entrega = 'pendiente' and p.id = any($2::uuid[])
        order by p.orden`,
      [despachoId, paradaIds],
    ),
  ]);
  if (!nuevas.length) throw new Error("Esas órdenes ya no están en la bandeja.");

  const ahora = ahoraEnZona();
  const par = despacho.parametros ?? {};
  const numero = (v: unknown, defecto: number) =>
    typeof v === "number" && isFinite(v) ? v : defecto;
  const salidaPlan = typeof par.hora_salida === "string" ? hhmm(par.hora_salida) : null;

  // La jornada acaba a la hora de salida más su duración.
  let finJornada: string | null = null;
  const jornada = numero(par.jornada_h, 0);
  if (salidaPlan && jornada > 0) {
    const [h, m] = salidaPlan.split(":").map(Number);
    const min = Math.min(h * 60 + m + Math.round(jornada * 60), 23 * 60 + 59);
    finJornada = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }

  const rotulos: PreparacionInsercion["rutas"] = {};
  const nombres: Record<string, string> = {};
  nuevas.forEach((p) => { nombres[p.id] = p.nombre ?? p.codigo ?? "Orden"; });

  const cuerpoRutas = rutas.map((r) => {
    const pendientes = r.paradas.filter((p) => p.estado_entrega === "pendiente");
    const gestionadas = r.paradas.filter((p) => p.estado_entrega !== "pendiente");
    const enCalle = Boolean(r.salida_real) || gestionadas.length > 0;
    pendientes.forEach((p) => { nombres[p.id] = p.nombre ?? p.codigo ?? `Parada ${p.orden}`; });

    // Dónde está: la última parada que gestionó.
    const ultima = gestionadas
      .filter((p) => p.hora_entrega)
      .sort((a, b) => (a.hora_entrega! < b.hora_entrega! ? 1 : -1))[0];

    // Desde cuándo está libre: ya, si está en la calle; si no, a su hora de
    // salida —o ya, si esa hora pasó y sigue en el centro—.
    const salida = hhmm(r.salida_prog) ?? salidaPlan ?? "08:00";
    const hora = enCalle
      ? null
      : despacho.futuro
        ? salida
        : despacho.es_hoy && salida > ahora ? salida : null;

    rotulos[r.id] = {
      rotulo: [
        `R-${String(r.indice + 1).padStart(2, "0")}`,
        r.placa,
        r.conductor,
      ].filter(Boolean).join(" · "),
      enCalle,
    };

    return {
      id: r.id,
      lat: ultima ? (ultima.gps_lat ?? ultima.lat) : null,
      lon: ultima ? (ultima.gps_lon ?? ultima.lon) : null,
      hora,
      pendientes: pendientes.map(aTienda),
      // El conductor ya va hacia su siguiente parada: delante no entra nada.
      fijas: enCalle && pendientes.length > 0 ? 1 : 0,
      // Lo entregado ya no ocupa: cuenta lo que le queda a bordo.
      capacidad_libre:
        r.capacidad_bultos != null
          ? Math.max(0, r.capacidad_bultos - pendientes.reduce((a, p) => a + p.bultos, 0))
          : null,
      paradas_libres:
        r.max_tiendas && r.max_tiendas > 0
          ? Math.max(0, r.max_tiendas - r.paradas.length)
          : null,
      // Los vehículos no guardan etiquetas: no se sabe qué lleva cada uno.
      etiquetas: null,
    };
  });

  return {
    cuerpo: {
      rutas: cuerpoRutas,
      nuevas: nuevas.map(aTienda),
      cd_lat: despacho.cd_lat,
      cd_lon: despacho.cd_lon,
      motor: "osrm",
      cerrado: par.cerrado !== false,
      hora_actual: ahora,
      servicio_min: numero(par.servicio_min, 10),
      servicio_min_bulto: numero(par.servicio_min_bulto, 0),
      fin_jornada: finJornada,
      reordenar,
      peso_prioridad: 1,
    },
    rutas: rotulos,
    nombres,
  };
}

export type ClienteHallado = {
  codigo: string;
  nombre: string;
  direccion: string | null;
  distrito: string | null;
  telefono: string | null;
  lat: number;
  lon: number;
};

/** Clientes con coordenadas cuyo nombre o código contiene el texto. */
export async function buscarClientes(texto: string) {
  const yo = await idSesion();
  const t = texto.trim();
  if (t.length < 2) return [];
  return comoUsuario<ClienteHallado>(
    yo,
    `select codigo, nombre, direccion, distrito, telefono, lat, lon
       from clientes
      where lat is not null and lon is not null
        and (nombre ilike $1 or codigo ilike $1)
      order by nombre limit 8`,
    [`%${t.replace(/[%_\\]/g, "\\$&")}%`],
  );
}
