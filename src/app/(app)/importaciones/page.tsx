import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { importaciones } from "@/app/acciones/datos";
import { BarraSuperior, Celda, Pastilla, Tabla, Tarjeta, EstadoVacio } from "@/components/ui";
import { estado as infoEstado } from "@/lib/despachos";
import { fechaHora } from "@/lib/horas";

/**
 * Qué archivos se han subido y en qué acabaron.
 *
 * La tabla existía desde el principio y no había pantalla que la mirase. Sin
 * esto no se puede responder quién subió el archivo de ayer, ni por qué uno
 * cargado no llegó a rutearse nunca.
 */
export default async function PaginaImportaciones() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const lista = await importaciones();
  const huerfanas = lista.filter((i) => i.despachos === 0).length;

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

      <div>
        {lista.length === 0 ? (
          <Tarjeta>
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
          </Tarjeta>
        ) : (
          <>
            <div>
              <Tabla
                cabeceras={["Identificador", "Estado", "Nombre de archivo", "Filas", "Usuario", "Fecha de carga"]}
                anchoMin={760}
              >
                {lista.map((i) => {
                  const info = i.estado ? infoEstado(i.estado) : null;
                  return (
                    <tr key={i.id} className="hover:bg-surface-2">
                      <Celda className="num">
                        {i.despacho_id ? (
                          <Link href={`/despachos/${i.despacho_id}`}>
                            {String(i.id).slice(0, 8)}
                          </Link>
                        ) : (
                          String(i.id).slice(0, 8)
                        )}
                      </Celda>
                      <Celda>
                        {i.despacho_id && info ? (
                          <span className="inline-flex items-center gap-2">
                            <Pastilla tono="ok">Importado</Pastilla>
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
                      <Celda className="num">{i.filas?.toLocaleString("es-PE") ?? "—"}</Celda>
                      <Celda>{i.autor ?? "—"}</Celda>
                      <Celda className="num">{fechaHora(i.creado_en)}</Celda>
                    </tr>
                  );
                })}
              </Tabla>
            </div>

            <p className="mt-3 text-[11.5px] text-ink-3">
              «Importado sin rutear» es un archivo que se subió al planificador y se
              abandonó sin guardar el despacho. No pasa nada por dejarlo, pero
              si se repite suele ser señal de que el archivo traía algo raro.
            </p>
          </>
        )}
      </div>
    </>
  );
}
