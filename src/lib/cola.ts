import { marcarParada, subirFoto, type Entrega } from "@/lib/entregas";

/**
 * Red de seguridad para las entregas que no consiguieron subir.
 *
 * En reparto la señal se cae: sótanos, mercados, zonas industriales. Lo que el
 * conductor guarda se escribe primero aquí (IndexedDB, sobrevive a cerrar el
 * navegador y a quedarse sin batería) y se sube en el acto. Si el envío falla,
 * la entrega se queda aquí y la consola lo dice con todas las letras.
 *
 * Lo que esta cola NO es: un buzón que manda cosas por su cuenta pasado un
 * rato. Eso existió y fue un error. El conductor no sabía cuándo salía su
 * entrega, y si cerraba la app antes de que venciera el plazo no salía nunca:
 * el móvil la daba por buena y en la torre esa parada seguía pendiente. Aquí
 * solo cae lo que ya intentó subir y no pudo.
 *
 * En Android la sincronización puede dispararse sola al recuperar red; en
 * iPhone Safari no lo permite en segundo plano, así que además se reintenta
 * cada vez que la app vuelve a primer plano.
 */
const BD = "ruteo-reparto";
const ALMACEN = "pendientes";

export type Pendiente = {
  parada_id: string;
  entrega: Entrega;
  foto: Blob | null;
  orgId: string;
  nombreParada: string;
  guardadoEn: number;
  intentos: number;
  ultimoError?: string;
  /**
   * Sube con cada escritura local.
   *
   * La subida solo borra la fila que subió. Si mientras viajaba el conductor
   * le añadió una foto o corrigió el resultado, la revisión ya no coincide y
   * la fila se queda para volver a subir con el añadido. Sin esto, borrar por
   * clave tira a la basura lo que se escribió durante el viaje a la red, y no
   * queda ni rastro de que existió.
   */
  rev: number;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(ALMACEN)) {
        bd.createObjectStore(ALMACEN, { keyPath: "parada_id" });
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

function operar<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (bd) =>
      new Promise<T>((resolve, reject) => {
        const tx = bd.transaction(ALMACEN, modo);
        const peticion = fn(tx.objectStore(ALMACEN));
        peticion.onsuccess = () => resolve(peticion.result);
        peticion.onerror = () => reject(peticion.error);
        tx.oncomplete = () => bd.close();
      }),
  );
}

/**
 * Lee una fila y decide qué hacer con ella dentro de la MISMA transacción.
 *
 * Todas las escrituras pasan por aquí. Leer y escribir en dos transacciones
 * distintas deja una rendija por la que se cuela otra escritura: así es como
 * anotar un fallo de red resucitaba la versión vieja de una entrega que el
 * conductor acababa de corregir.
 *
 * Devolver `null` deja la fila como estaba; `"borrar"` la elimina.
 */
function modificar(
  paradaId: string,
  decidir: (previa: Pendiente | undefined) => Pendiente | "borrar" | null,
): Promise<boolean> {
  return abrir().then(
    (bd) =>
      new Promise<boolean>((resolve, reject) => {
        let hecho = false;
        const tx = bd.transaction(ALMACEN, "readwrite");
        const almacen = tx.objectStore(ALMACEN);
        const lectura = almacen.get(paradaId) as IDBRequest<Pendiente | undefined>;
        lectura.onsuccess = () => {
          const decision = decidir(lectura.result);
          if (decision === null) return;
          if (decision === "borrar") almacen.delete(paradaId);
          else almacen.put(decision);
          hecho = true;
        };
        tx.oncomplete = () => {
          bd.close();
          resolve(hecho);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transacción cancelada"));
      }),
  );
}

/**
 * Aviso de que la cola cambió.
 *
 * La consola vive en otro componente y es la que enseña «te quedan N entregas
 * por subir». Sin este aviso no se enteraría hasta recargar.
 */
export const EVENTO_COLA = "cola:cambio";

function avisarCambio() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_COLA));
}

export type Nueva = Omit<Pendiente, "guardadoEn" | "intentos" | "rev">;

/**
 * Guarda la entrega en el móvil. Todavía no la manda: de eso se encarga
 * `subirUna`, y solo cuando el conductor lo ha pedido.
 *
 * Si ya había una fila para esta parada —una corrección— se conserva su foto
 * cuando la nueva no trae ninguna. Antes se sustituía la fila entera, así que
 * corregir el número de bultos borraba la prueba de entrega que el conductor
 * acababa de hacer y ya no estaba en ninguna parte.
 */
export async function encolar(p: Nueva) {
  await modificar(p.parada_id, (previa) => ({
    ...p,
    foto: p.foto ?? previa?.foto ?? null,
    entrega: {
      ...p.entrega,
      foto_url: p.entrega.foto_url ?? previa?.entrega.foto_url ?? null,
    },
    guardadoEn: Date.now(),
    intentos: 0,
    rev: (previa?.rev ?? 0) + 1,
  }));
  avisarCambio();
}

export function listarPendientes(): Promise<Pendiente[]> {
  return operar<Pendiente[]>("readonly", (s) => s.getAll() as IDBRequest<Pendiente[]>).then(
    // `getAll` devuelve por orden de clave, y la clave es un UUID: sin esto la
    // cola sube en orden aleatorio y la torre acaba enseñando la parada 8
    // antes que la 7 aunque se marcaran al revés.
    (todas) => todas.sort((a, b) => a.guardadoEn - b.guardadoEn),
  );
}

/** Qué paradas siguen sin llegar al servidor: lo local manda sobre ellas. */
export async function idsPendientes(): Promise<Set<string>> {
  try {
    return new Set((await listarPendientes()).map((p) => p.parada_id));
  } catch {
    return new Set();
  }
}

export function quitarPendiente(paradaId: string) {
  return operar("readwrite", (s) => s.delete(paradaId));
}

/** Borra la fila solo si nadie la tocó mientras subía. */
function quitarSiIntacta(paradaId: string, rev: number) {
  return modificar(paradaId, (previa) =>
    !previa || previa.rev !== rev ? null : "borrar",
  );
}

function anotarFallo(paradaId: string, error: string) {
  return modificar(paradaId, (previa) =>
    previa ? { ...previa, intentos: previa.intentos + 1, ultimoError: error } : null,
  );
}

/**
 * Añade la posición a una entrega que sigue en la cola.
 *
 * El GPS de reserva se pide después de guardar, porque la entrega no puede
 * esperarlo. Si la fila ya subió no se hace nada: resucitarla la subiría dos
 * veces por una coordenada que es un respaldo, no el dato.
 */
export function parchearPosicion(paradaId: string, lat: number, lon: number) {
  return modificar(paradaId, (previa) =>
    previa
      ? { ...previa, rev: previa.rev + 1, entrega: { ...previa.entrega, gps_lat: lat, gps_lon: lon } }
      : null,
  );
}

/** Sube una entrega concreta y la borra solo si el servidor la confirmó. */
async function subir(p: Pendiente): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    let fotoUrl = p.entrega.foto_url ?? null;
    if (p.foto && !fotoUrl) fotoUrl = await subirFoto(p.orgId, p.parada_id, p.foto);
    await marcarParada({ ...p.entrega, foto_url: fotoUrl });
    await quitarSiIntacta(p.parada_id, p.rev);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await anotarFallo(p.parada_id, error);
    return { ok: false, error };
  }
}

export type Resultado = { estado: "subida" } | { estado: "en-el-movil"; error: string };

/**
 * Manda la entrega que el conductor acaba de guardar, y solo esa.
 *
 * Devuelve la verdad para poder decírsela: o llegó al servidor, o se quedó en
 * el móvil. Enseñar «guardado» a secas cuando es lo segundo es precisamente
 * el fallo que hace que una ruta aparezca completa en el móvil y a medias en
 * la torre.
 */
export async function subirUna(paradaId: string): Promise<Resultado> {
  const p = (await listarPendientes()).find((x) => x.parada_id === paradaId);
  if (!p) return { estado: "subida" }; // ya no está: subió en otra pasada
  const r = await subir(p);
  avisarCambio();
  return r.ok ? { estado: "subida" } : { estado: "en-el-movil", error: r.error };
}

export type ResultadoSync = { subidas: number; fallidas: number; quedan: number };

let enMarcha: Promise<ResultadoSync> | null = null;

/**
 * Reintenta todo lo que quedó atascado.
 *
 * Seis sitios distintos pueden pedirla —recuperar señal, volver a primer
 * plano, el repaso periódico, abrir una ruta, el aviso de la consola, cerrar
 * sesión— así que dos llamadas a la vez comparten una única pasada. Sin ese
 * cerrojo, dos pasadas simultáneas suben la misma entrega dos veces y el
 * fallo anotado por una resucita la fila que la otra acaba de borrar.
 */
export function sincronizar(): Promise<ResultadoSync> {
  if (enMarcha) return enMarcha;
  enMarcha = pasada().finally(() => {
    enMarcha = null;
  });
  return enMarcha;
}

async function pasada(): Promise<ResultadoSync> {
  if (typeof indexedDB === "undefined") return { subidas: 0, fallidas: 0, quedan: 0 };

  const cola = await listarPendientes();
  let subidas = 0;
  let fallidas = 0;

  for (const p of cola) {
    const r = await subir(p);
    if (r.ok) subidas++;
    else fallidas++;
  }

  const quedan = (await listarPendientes()).length;
  avisarCambio();
  return { subidas, fallidas, quedan };
}

/**
 * Cuántas entregas siguen sin llegar al servidor y ya son un problema.
 *
 * Una entrega recién guardada está en la cola el instante que tarda en subir;
 * contarla haría parpadear la alarma en cada parada. Cuenta la que ya falló y
 * la que lleva demasiado esperando.
 */
export async function contarAtascadas(margenMs = 10000) {
  const ahora = Date.now();
  return (await listarPendientes()).filter(
    (p) => p.intentos > 0 || ahora - p.guardadoEn > margenMs,
  ).length;
}

/**
 * Añade a una entrega que todavía está en la cola lo que el conductor adjunta
 * después: la foto, quién recibió o una observación.
 *
 * Devuelve `false` si la entrega ya subió, y entonces quien llama tiene que
 * mandarla otra vez contra el servidor. Tragarse ese `false` es exactamente
 * cómo se pierde una foto sin que nadie lo note.
 */
export function completarPendiente(
  paradaId: string,
  extra: { foto?: Blob | null; recibe?: string | null; observaciones?: string | null },
): Promise<boolean> {
  return modificar(paradaId, (previa) =>
    previa
      ? {
          ...previa,
          rev: previa.rev + 1,
          foto: extra.foto !== undefined ? extra.foto : previa.foto,
          entrega: {
            ...previa.entrega,
            recibe: extra.recibe !== undefined ? extra.recibe : previa.entrega.recibe,
            observaciones:
              extra.observaciones !== undefined
                ? extra.observaciones
                : previa.entrega.observaciones,
          },
        }
      : null,
  ).then((cambiada) => {
    if (cambiada) avisarCambio();
    return cambiada;
  });
}
