import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";
import { BarraSuperior, Celda, EstadoVacio, Pastilla, Tabla } from "@/components/ui";
import { estado as infoEstado, ESTADOS } from "@/lib/despachos";

type Fila = {
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
  km: number;
  costo: number;
  sin_conductor: number;
  /** Puntos que quedaron en la bandeja: cuentan en el documento, no en el reparto. */
  bandeja: number;
  bultos_bandeja: number;
};


export default async function PaginaDespachos({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado: filtro } = await searchParams;
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // Si la base no responde se muestra el aviso y la página sigue en pie: es
  // un histórico, no vale tumbar la pantalla entera por una lectura caída.
  let todos: Fila[] = [];
  let error: string | null = null;
  try {
    todos = await comoUsuario<Fila>(
      sesion.user.id,
      "select * from public.resumen_despachos()",
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const despachos = filtro ? todos.filter((d) => d.estado === filtro) : todos;

  const cuenta = (e: string) => todos.filter((d) => d.estado === e).length;
  const conteos = (Object.keys(ESTADOS) as (keyof typeof ESTADOS)[])
    .map((e) => ({ clave: e, ...ESTADOS[e], n: cuenta(e) }))
    .filter((e) => e.n > 0);

  return (
    <>
      <BarraSuperior
        migaja=""
        titulo="Despachos"
        acciones={
          <>
            <Link
              href="/rutas"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[14px] font-bold text-ink transition hover:bg-canvas"
            >
              Ver rutas
            </Link>
            <Link
              href="/planificador"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber px-3 text-[14px] font-bold text-white transition hover:bg-amber-600"
            >
              + Nuevo despacho
            </Link>
          </>
        }
      />

      <div>
        {error && (
          <div className="mb-3 rounded-[8px] border border-bad/30 bg-bad-bg px-4 py-3 text-[13px] text-bad">
            No se pudo leer el histórico: {error}
          </div>
        )}

        {todos.length === 0 ? (
          <EstadoVacio
            icono="📅"
            titulo="Todavía no hay despachos"
            descripcion="Sube el archivo del día en el planificador. Quedará aquí como «Cargado sin ruteo» y lo irás llevando por sus estados hasta el reparto."
            accion={
              <Link
                href="/planificador"
                className="inline-flex h-8 items-center rounded-full bg-amber px-4 text-[14px] font-bold text-white transition hover:bg-amber-600"
              >
                Ir al planificador
              </Link>
            }
          />
        ) : (
          <>
            {/* El ciclo de vida a la vista, en pestañas como las de Alertas */}
            <div className="mb-3 flex overflow-x-auto rounded-[6px] border border-line">
              <Filtro href="/despachos" activo={!filtro} texto="Todos" n={todos.length} />
              {conteos.map((e) => (
                <Filtro
                  key={e.clave}
                  href={`/despachos?estado=${e.clave}`}
                  activo={filtro === e.clave}
                  texto={e.texto}
                  n={e.n}
                />
              ))}
            </div>

            <div className="pb-3 pt-1 text-[16px] text-ink-2">
              <strong className="num font-bold">{despachos.length}</strong> despachos
            </div>

            <Tabla
              cabeceras={["Despacho", "Estado", "Nombre de archivo", "Rutas", "Órdenes", "Km", "Avance", "Usuario", "Fecha"]}
              anchoMin={980}
            >
              {despachos.map((d) => {
                const info = infoEstado(d.estado);
                const cerradas = d.entregadas + d.fallidas + d.reprogramadas;
                const pct = d.paradas ? Math.round((cerradas / d.paradas) * 100) : 0;
                return (
                  <tr key={d.id} className="hover:bg-surface-2">
                    <Celda>
                      <Link href={`/despachos/${d.id}`}>{d.nombre ?? "Despacho"}</Link>
                    </Celda>
                    <Celda>
                      <Pastilla tono={info.tono}>{info.texto}</Pastilla>
                    </Celda>
                    <Celda>{d.archivo ?? "—"}</Celda>
                    {/* Un despacho sin rutear guarda sus puntos en una ruta
                        contenedora que no cuenta como ruta de reparto. */}
                    <Celda className="num text-right">{d.estado === "cargado" ? "—" : d.rutas}</Celda>
                    {/* El tamaño del documento sí incluye la bandeja: lo que
                        se subió está guardado aunque nadie lo reparta. */}
                    <Celda className="num text-right">
                      {(d.paradas + d.bandeja).toLocaleString("es-PE")}
                    </Celda>
                    <Celda className="num text-right">
                      {d.km > 0 ? Number(d.km).toFixed(0) : "—"}
                    </Celda>
                    <Celda>
                      {d.estado === "cargado" ? (
                        "Sin rutear"
                      ) : cerradas > 0 ? (
                        <span className="num">{pct}% gestionado</span>
                      ) : d.sin_conductor > 0 && d.rutas > 0 ? (
                        <span className="num text-warn">{d.sin_conductor} sin conductor</span>
                      ) : (
                        <span className="text-ok">Listo para salir</span>
                      )}
                    </Celda>
                    <Celda>{d.autor ?? "—"}</Celda>
                    <Celda className="num">{d.fecha}</Celda>
                  </tr>
                );
              })}
            </Tabla>

            {despachos.length === 0 && (
              <p className="py-8 text-center text-[14px] text-ink-2">
                Ningún despacho en ese estado.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Filtro({
  href,
  activo,
  texto,
  n,
}: {
  href: string;
  activo: boolean;
  texto: string;
  n: number;
}) {
  return (
    <Link
      href={href}
      className={`flex h-[38px] min-w-[150px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-r border-line px-3 text-[13px] transition last:border-r-0 ${
        activo
          ? "bg-surface font-bold text-ink shadow-[inset_0_-2px_0_var(--color-amber)]"
          : "bg-surface-2 text-ink-3 hover:text-ink-2"
      }`}
    >
      {texto} <span className="num opacity-70">{n}</span>
    </Link>
  );
}
