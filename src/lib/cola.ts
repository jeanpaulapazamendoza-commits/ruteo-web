import { marcarParada, subirFoto, type Entrega } from "@/lib/entregas";

/**
 * Cola de entregas pendientes de subir.
 *
 * En reparto la señal se cae: sótanos, mercados, zonas industriales. Lo que
 * el conductor marca se guarda primero aquí (IndexedDB, sobrevive a cerrar el
 * navegador y a quedarse sin batería) y se sube en cuanto vuelve la cobertura.
 * La foto se guarda como Blob en el mismo registro.
 *
 * En Android la sincronización puede dispararse sola al recuperar red; en
 * iPhone Safari no lo permite en segundo plano, así que además se reintenta
 * cada vez que la app vuelve a primer plano y se muestra un aviso con lo que
 * queda por subir.
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
 * Aviso de que la cola cambió.
 *
 * La cabecera vive en otro componente y es la que enseña «te quedan N
 * entregas por subir». Sin este aviso no se enteraría hasta recargar, y en
 * iPhone —donde la cola no puede subirse sola— ese cartel es lo único que le
 * dice al conductor que le falta algo.
 */
export const EVENTO_COLA = "cola:cambio";

function avisarCambio() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_COLA));
}

export async function encolar(p: Omit<Pendiente, "guardadoEn" | "intentos">) {
  await operar("readwrite", (s) =>
    s.put({ ...p, guardadoEn: Date.now(), intentos: 0 } satisfies Pendiente),
  );
  avisarCambio();
}

export function listarPendientes(): Promise<Pendiente[]> {
  return operar<Pendiente[]>("readonly", (s) => s.getAll() as IDBRequest<Pendiente[]>);
}

export function quitarPendiente(paradaId: string) {
  return operar("readwrite", (s) => s.delete(paradaId));
}

function anotarFallo(p: Pendiente, error: string) {
  return operar("readwrite", (s) =>
    s.put({ ...p, intentos: p.intentos + 1, ultimoError: error } satisfies Pendiente),
  );
}

export type ResultadoSync = { subidas: number; fallidas: number; quedan: number };

/**
 * Intenta subir todo lo pendiente. Es seguro llamarla muchas veces: cada
 * entrega se borra de la cola solo cuando el servidor la confirma, y volver a
 * marcar la misma parada sobrescribe su registro en vez de duplicarlo.
 */
export async function sincronizar(): Promise<ResultadoSync> {
  if (typeof indexedDB === "undefined") return { subidas: 0, fallidas: 0, quedan: 0 };

  const cola = await listarPendientes();
  let subidas = 0;
  let fallidas = 0;

  for (const p of cola) {
    try {
      let fotoUrl = p.entrega.foto_url ?? null;
      if (p.foto && !fotoUrl) {
        fotoUrl = await subirFoto(p.orgId, p.parada_id, p.foto);
      }
      await marcarParada({ ...p.entrega, foto_url: fotoUrl });
      await quitarPendiente(p.parada_id);
      subidas++;
    } catch (e) {
      fallidas++;
      await anotarFallo(p, e instanceof Error ? e.message : String(e));
    }
  }

  const quedan = (await listarPendientes()).length;
  avisarCambio();
  return { subidas, fallidas, quedan };
}
