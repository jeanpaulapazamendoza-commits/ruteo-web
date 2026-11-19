"use server";

import { auth } from "@/auth";
import { comoUsuario } from "@/lib/db";

/**
 * Puerta única a las funciones de negocio de la base.
 *
 * Antes cada componente llamaba a `supabase.rpc(...)` desde el navegador.
 * Ahora la llamada cruza al servidor por aquí, que es el único que conoce la
 * conexión, y desde allí se ejecuta con la identidad del usuario para que el
 * RLS siga decidiendo qué puede tocar.
 *
 * El nombre llega del cliente, así que no se interpola sin más: solo pasan
 * las funciones de esta lista. La base ya impide invocar lo que no está
 * concedido al rol `authenticated` —`iniciar_sesion` y `registrar_empresa`,
 * por ejemplo, están revocadas—, pero una lista explícita cuesta nada y
 * evita depender de que esos permisos nunca se aflojen por descuido.
 */
const PERMITIDAS = {
  // Devuelven un solo valor.
  crear_despacho_cargado: "escalar",
  replanificar_despacho: "escalar",
  asignar_rutas: "escalar",
  eliminar_despacho: "escalar",
  mover_paradas: "escalar",
  iniciar_ruta: "escalar",
  marcar_parada: "escalar",
  eliminar_tiendas: "escalar",
  eliminar_carga: "escalar",
  eliminar_tiendas_sin_archivo: "escalar",
  detalle_organizacion: "escalar",
  cambiar_estado_organizacion: "escalar",
  fijar_clave: "escalar",
  // Devuelven filas.
  resumen_despachos: "conjunto",
  resumen_organizaciones: "conjunto",
} as const;

export type NombreRpc = keyof typeof PERMITIDAS;

const NOMBRE_ARG = /^[a-z_][a-z0-9_]*$/;

/**
 * Invoca una función de la base con argumentos con nombre.
 *
 * Se usa la notación `arg => $1` de Postgres, la misma convención de nombres
 * que ya usaban las llamadas existentes, para no tener que recordar el orden
 * de los parámetros de cada función.
 */
export async function rpc<T = unknown>(
  nombre: NombreRpc,
  args: Record<string, unknown> = {},
): Promise<T> {
  const forma = PERMITIDAS[nombre];
  if (!forma) throw new Error(`Función no permitida: ${nombre}`);

  const sesion = await auth();
  if (!sesion?.user) throw new Error("Tu sesión caducó. Vuelve a entrar.");

  const claves = Object.keys(args);
  for (const k of claves) {
    if (!NOMBRE_ARG.test(k)) throw new Error(`Argumento no válido: ${k}`);
  }

  const lista = claves.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const valores = claves.map((k) => {
    const v = args[k];
    // Los objetos viajan como jsonb, pero los arrays no: el driver ya los
    // convierte al formato de array de Postgres, y serializarlos a JSON
    // rompería los parámetros declarados `uuid[]`.
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v;
    return JSON.stringify(v);
  });

  const texto =
    forma === "conjunto"
      ? `select * from public.${nombre}(${lista})`
      : `select public.${nombre}(${lista}) as resultado`;

  const filas = await comoUsuario<Record<string, unknown>>(
    sesion.user.id,
    texto,
    valores,
  );

  return (forma === "conjunto" ? filas : filas[0]?.resultado) as T;
}
