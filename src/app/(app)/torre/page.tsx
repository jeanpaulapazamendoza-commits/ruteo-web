import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario, unaFila } from "@/lib/db";
import { BarraSuperior, Celda, Tabla, Tarjeta, EstadoVacio, Pastilla } from "@/components/ui";
import { diaLargo } from "@/lib/horas";
import { asegurarTrazados } from "@/lib/trazado";
import TorreControl, {
  type ParadaSeguimiento,
  type RutaSeguida,
} from "@/components/TorreControl";

/** Una línea por despacho, tal como la devuelve `resumen_despachos()`. */
type ResumenDespacho = {
  id: string;
  nombre: string | null;
  fecha: string;
  estado: string;
  creado_en: string;
  autor: string | null;
  archivo: string | null;
  rutas: number;
  paradas: number;
  entregadas: number;
  fallidas: number;
  reprogramadas: number;
  bultos: number;
  /** Puntos que quedaron sin asignar: no salen a reparto, pero están guardados. */
  bandeja: number;
  bultos_bandeja: number;
};

const fechaLarga = diaLargo;

export default async function PaginaTorre({
  searchParams,
}: {
  // En Next 16 también searchParams llega como promesa.
  searchParams: Promise<{ despacho?: string }>;
}) {
  const { despacho: elegido } = await searchParams;
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");
  const yo = sesion.user.id;

  // Lo que está solo cargado todavía no tiene rutas que seguir.
  const lista = await comoUsuario<ResumenDespacho>(
    yo,
    "select * from public.resumen_despachos() where estado <> 'cargado'",
  );

  if (!lista.length) {
    return (
      <>
        <BarraSuperior migaja="Operación" titulo="Torre de control" />
        <div className="p-4">
          <Tarjeta>
            <EstadoVacio
              icono="◉"
              titulo="No hay despachos que seguir"
              descripcion="La torre de control muestra en vivo lo que tus conductores van marcando. Primero planifica y guarda un despacho."
              accion={
                <Link
                  href="/planificador"
                  className="inline-block rounded-full border border-amber-600 bg-amber px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-amber-600 hover:text-white"
                >
                  Ir al planificador
                </Link>
              }
            />
          </Tarjeta>
        </div>
      </>
    );
  }

  const activo = elegido ? lista.find((d) => d.id === elegido) : null;

  // ── Listado: una línea por despacho, sin desplegar nada ──────────────────
  if (!activo) {
    const enCurso = lista.filter((d) => d.entregadas + d.fallidas + d.reprogramadas > 0);

    return (
      <>
        <BarraSuperior
          migaja="Operación"
          titulo="Torre de control"
          acciones={
            <span className="text-[12px] text-ink-2">
              <b className="num text-ink">{lista.length}</b> despachos
              {enCurso.length > 0 && (
                <>
                  {" · "}
                  <b className="num text-live">{enCurso.length}</b> con movimiento
                </>
              )}
            </span>
          }
        />

        <div>
          <div className="pb-3 pt-1 text-[16px] text-ink-2">
            <strong className="num font-bold">{lista.length}</strong> despachos en la torre
          </div>

          <Tabla
            cabeceras={["Despacho", "Estado", "Fecha", "Rutas", "Órdenes", "Bultos", "Cumplimiento", "Incidencias", "Usuario"]}
            anchoMin={980}
          >
            {lista.map((d) => {
              const cerradas = d.entregadas + d.fallidas + d.reprogramadas;
              const pct = d.paradas ? Math.round((cerradas / d.paradas) * 100) : 0;
              const terminado = d.paradas > 0 && cerradas === d.paradas;
              return (
                <tr key={d.id} className="hover:bg-surface-2">
                  <Celda>
                    <Link href={`/torre?despacho=${d.id}`}>{d.nombre ?? "Despacho"}</Link>
                    {d.archivo && <div className="num text-[12px] text-ink-3">{d.archivo}</div>}
                  </Celda>
                  <Celda>
                    {cerradas === 0 ? (
                      <Pastilla tono="plan">Ruta no iniciada</Pastilla>
                    ) : terminado ? (
                      <Pastilla tono="ok">Ruta finalizada</Pastilla>
                    ) : (
                      <Pastilla tono="live">En progreso</Pastilla>
                    )}
                  </Celda>
                  <Celda className="num">{d.fecha}</Celda>
                  <Celda className="num text-right">{d.rutas}</Celda>
                  <Celda className="num text-right">{d.paradas.toLocaleString("es-PE")}</Celda>
                  <Celda className="num text-right">{d.bultos.toLocaleString("es-PE")}</Celda>
                  <Celda>
                    <div className="flex items-center gap-2.5">
                      <div className="h-[10px] w-[94px] overflow-hidden rounded-full bg-[#d4d9dd]">
                        <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="num">{pct}%</span>
                      <span className="num text-[12px] text-ink-3">
                        {cerradas}/{d.paradas}
                      </span>
                    </div>
                  </Celda>
                  {/* Los recuentos son de reparto: la bandeja no sale, así
                      que se avisa aparte en vez de hundir el porcentaje. */}
                  <Celda>
                    {d.fallidas > 0 && <span className="num text-bad">{d.fallidas} no entregadas</span>}
                    {d.fallidas > 0 && d.bandeja > 0 && " · "}
                    {d.bandeja > 0 && <span className="num text-warn">{d.bandeja} sin asignar</span>}
                    {d.fallidas === 0 && d.bandeja === 0 && "—"}
                  </Celda>
                  <Celda>{d.autor ?? "—"}</Celda>
                </tr>
              );
            })}
          </Tabla>
        </div>
      </>
    );
  }

  // ── Detalle: seguimiento en vivo del despacho elegido ────────────────────
  await asegurarTrazados(yo, { despacho: activo.id });

  const [paradas, rutas, cab] = await Promise.all([
    comoUsuario<ParadaSeguimiento>(
      yo,
      `select p.id, p.orden, p.codigo, p.nombre, p.distrito, p.lat, p.lon,
              p.bultos, p.prioridad, p.eta, p.estado_entrega, p.hora_entrega,
              p.bultos_entregados, p.motivo, p.foto_url, p.observaciones,
              p.recibe, r.indice as ruta_indice
         from paradas p
         join rutas r on r.id = p.ruta_id
        where r.despacho_id = $1 and not r.sin_asignar
        order by r.indice, p.orden`,
      [activo.id],
    ),
    // La geometría solo se usa para dibujar el recorrido de fondo; se pide
    // una vez aquí y no en cada sondeo, que sería mover mucho por nada.
    comoUsuario<RutaSeguida>(
      yo,
      `select r.indice, r.geometria, r.salida_real, c.nombre as conductor,
              r.base_nombre, r.base_lat, r.base_lon
         from rutas r
         left join perfiles c on c.id = r.conductor_id
        where r.despacho_id = $1 and not r.sin_asignar
        order by r.indice`,
      [activo.id],
    ),
    unaFila<{ cd_lat: number | null; cd_lon: number | null }>(
      yo,
      "select cd_lat, cd_lon from despachos where id = $1",
      [activo.id],
    ),
  ]);

  return (
    <>
      <BarraSuperior
        migaja={
          <Link href="/torre" className="transition hover:text-ink">
            ← Todos los despachos
          </Link>
        }
        titulo={activo.nombre ?? "Despacho"}
        acciones={
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-3">
              {fechaLarga(activo.fecha)}
              {activo.autor && <> · {activo.autor}</>}
              {activo.archivo && <> · 📄 {activo.archivo}</>}
            </span>
            <Link
              href={`/despachos/${activo.id}`}
              className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-canvas"
            >
              Ver planificación
            </Link>
          </div>
        }
      />

      <TorreControl
        despachoId={activo.id}
        inicial={paradas}
        rutas={rutas}
        cd={
          cab?.cd_lat != null && cab?.cd_lon != null
            ? { lat: cab.cd_lat, lon: cab.cd_lon }
            : null
        }
      />
    </>
  );
}
