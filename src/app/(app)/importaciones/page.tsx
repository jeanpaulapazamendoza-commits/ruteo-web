import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { autoresDeImportaciones, importaciones } from "@/app/acciones/datos";
import { BarraSuperior, Celda, Pastilla, Tabla, Tarjeta, EstadoVacio } from "@/components/ui";
import { estado as infoEstado } from "@/lib/despachos";
import { fechaHora } from "@/lib/horas";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Qué archivos se han subido y en qué acabaron.
 *
 * La tabla existía desde el principio y no había pantalla que la mirase. Sin
 * esto no se puede responder quién subió el archivo de ayer, ni por qué uno
 * cargado no llegó a rutearse nunca.
 *
 * Los filtros van en la dirección y no en el estado de un componente: así la
 * lista filtrada se puede enlazar, y la página sigue siendo del servidor.
 */
export default async function PaginaImportaciones({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; usuario?: string }>;
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const q = await searchParams;
  // Lo que llega de la barra de direcciones acaba en un `::date` de Postgres.
  const fecha = q.fecha && DIA.test(q.fecha) ? q.fecha : undefined;
  const usuario = q.usuario?.slice(0, 80) || undefined;
  const filtrando = Boolean(fecha || usuario);

  const [lista, autores] = await Promise.all([
    importaciones({ fecha, usuario }),
    autoresDeImportaciones(),
  ]);

  return (
    <>
      {/* Cabecera de la referencia: «Últimas Importaciones», con la plantilla
          y el botón de importar a la derecha. */}
      <BarraSuperior
        migaja=""
        titulo="Últimas Importaciones"
        acciones={
          <>
            <a
              href="/plantilla.csv"
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[14px] font-bold text-ink transition hover:bg-canvas"
            >
              ⤓ Descargar plantilla
            </a>
            <Link
              href="/planificador"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-amber px-3 text-[14px] font-bold text-white transition hover:bg-amber-600"
            >
              Importar
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Filtros: fecha de creación y usuario, como en la referencia. */}
        <form className="flex flex-wrap items-center gap-2" action="/importaciones">
          <input
            type="date"
            name="fecha"
            defaultValue={fecha ?? ""}
            title="Fecha de creación"
            aria-label="Fecha de creación"
            className="num w-[190px] outline-none"
          />
          <select
            name="usuario"
            defaultValue={usuario ?? ""}
            aria-label="Usuario"
            className="w-[240px] outline-none"
          >
            <option value="">Usuario</option>
            {autores.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full bg-amber px-5 text-[14px] font-bold text-white transition hover:bg-amber-600"
          >
            Filtrar
          </button>
          {filtrando && (
            <Link
              href="/importaciones"
              className="inline-flex h-10 items-center rounded-full border border-line-strong bg-surface px-4 text-[14px] font-bold text-ink transition hover:bg-canvas"
            >
              Quitar filtros
            </Link>
          )}
        </form>

        {lista.length === 0 ? (
          <Tarjeta>
            {filtrando ? (
              <EstadoVacio
                icono="⤓"
                titulo="Ningún archivo coincide"
                descripcion="Prueba con otra fecha u otro usuario, o quita los filtros."
              />
            ) : (
              <EstadoVacio
                icono="⤓"
                titulo="Todavía no has subido ningún archivo"
                descripcion="Cada archivo que subas en el planificador queda registrado aquí con quién lo subió, cuántas filas traía y en qué despacho acabó."
                accion={
                  <Link
                    href="/planificador"
                    className="inline-block rounded-full border border-amber-600 bg-amber px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-amber-600 hover:text-white"
                  >
                    Ir al planificador
                  </Link>
                }
              />
            )}
          </Tarjeta>
        ) : (
          <>
            <Tabla
              cabeceras={["Identificador", "Estado", "Nombre de archivo", "Filas", "Usuario", "Fecha de carga"]}
              anchoMin={820}
            >
              {lista.map((i) => {
                const info = i.estado ? infoEstado(i.estado) : null;
                const observaciones = (i.errores ?? 0) + (i.avisos ?? 0);
                return (
                  <tr key={i.id} className="hover:bg-surface-2">
                    <Celda className="num">
                      <Link href={`/importaciones/${i.id}`}>{String(i.id).slice(0, 8)}</Link>
                    </Celda>
                    <Celda>
                      {i.despacho_id && info ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {observaciones > 0 ? (
                            <Pastilla tono="warn">Importado con observaciones</Pastilla>
                          ) : (
                            <Pastilla tono="ok">Importado</Pastilla>
                          )}
                          <Pastilla tono={info.tono}>{info.texto}</Pastilla>
                          {i.despachos > 1 && (
                            <span className="num text-[11px] text-ink-3">
                              +{i.despachos - 1}
                            </span>
                          )}
                        </span>
                      ) : (
                        <Pastilla tono="warn">Importado sin rutear</Pastilla>
                      )}
                    </Celda>
                    <Celda>{i.nombre_archivo}</Celda>
                    <Celda className="num">
                      {i.filas?.toLocaleString("es-PE") ?? "—"}
                      {(i.errores ?? 0) > 0 && (
                        <span className="ml-1.5 text-[12px] text-bad">
                          · {i.errores} con error
                        </span>
                      )}
                    </Celda>
                    <Celda>{i.autor ?? "—"}</Celda>
                    <Celda className="num">{fechaHora(i.creado_en)}</Celda>
                  </tr>
                );
              })}
            </Tabla>

            <p className="text-[11.5px] leading-relaxed text-ink-3">
              El identificador abre el detalle: las filas que se rechazaron al leer el archivo,
              las que entraron con una coordenada dudosa y las órdenes que dejó. «Importado sin
              rutear» es un archivo que se subió y se abandonó sin guardar el despacho.
            </p>
          </>
        )}
      </div>
    </>
  );
}
