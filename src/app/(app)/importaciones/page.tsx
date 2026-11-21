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
      <BarraSuperior
        migaja="Datos"
        titulo="Archivos cargados"
        acciones={
          <span className="text-[12px] text-ink-2">
            <b className="num text-ink">{lista.length}</b> archivos
            {huerfanas > 0 && (
              <>
                {" · "}
                <b className="num text-warn">{huerfanas}</b> sin rutear
              </>
            )}
          </span>
        }
      />

      <div className="p-4">
        {lista.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="⤓"
              titulo="Todavía no has subido ningún archivo"
              descripcion="Cada archivo que subas en el planificador queda registrado aquí con quién lo subió, cuántas filas traía y en qué despacho acabó."
              accion={
                <Link
                  href="/planificador"
                  className="inline-block rounded-[9px] border border-amber-600 bg-amber px-4 py-2.5 text-[13.5px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white"
                >
                  Ir al planificador
                </Link>
              }
            />
          </Tarjeta>
        ) : (
          <>
            <Tarjeta className="overflow-hidden">
              <Tabla
                cabeceras={["Archivo", "Filas", "Subido", "Por", "Acabó en"]}
                anchoMin={620}
              >
                {lista.map((i) => {
                  const info = i.estado ? infoEstado(i.estado) : null;
                  return (
                    <tr key={i.id}>
                      <Celda className="num font-semibold">📄 {i.nombre_archivo}</Celda>
                      <Celda className="num text-ink-2">
                        {i.filas?.toLocaleString("es-PE") ?? "—"}
                      </Celda>
                      <Celda className="num text-ink-2">{fechaHora(i.creado_en)}</Celda>
                      <Celda className="text-ink-2">{i.autor ?? "—"}</Celda>
                      <Celda>
                        {i.despacho_id && info ? (
                          <Link
                            href={`/despachos/${i.despacho_id}`}
                            className="inline-flex items-center gap-2 transition hover:underline"
                          >
                            <Pastilla tono={info.tono}>{info.texto}</Pastilla>
                            <span className="truncate">{i.despacho ?? "Despacho"}</span>
                            {i.despachos > 1 && (
                              <span className="num text-[11px] text-ink-3">
                                +{i.despachos - 1}
                              </span>
                            )}
                          </Link>
                        ) : (
                          <span className="text-[12px] text-warn">Nunca se ruteó</span>
                        )}
                      </Celda>
                    </tr>
                  );
                })}
              </Tabla>
            </Tarjeta>

            <p className="mt-3 text-[11.5px] text-ink-3">
              «Nunca se ruteó» es un archivo que se subió al planificador y se
              abandonó sin guardar el despacho. No pasa nada por dejarlo, pero
              si se repite suele ser señal de que el archivo traía algo raro.
            </p>
          </>
        )}
      </div>
    </>
  );
}
