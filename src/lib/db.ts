import "server-only";
import { neon } from "@neondatabase/serverless";

/**
 * Acceso a la base de datos.
 *
 * Va sobre HTTP y no sobre una conexión TCP persistente a propósito. Neon
 * suspende el cómputo a los 5 minutos de inactividad y mata las conexiones
 * abiertas con «terminating connection due to administrator command»; una
 * aplicación que guarda un pool ve fallar la siguiente consulta y suele
 * tratarlo como sesión caída, devolviendo al usuario al login. Sobre HTTP
 * cada consulta es independiente: despertar el cómputo cuesta unos cientos
 * de milisegundos y nunca hay una conexión muerta que recoger.
 *
 * Nada de esto llega al navegador: `server-only` rompe la compilación si
 * alguien lo importa desde un componente de cliente.
 */
const sql = neon(process.env.DATABASE_URL!);

/** Rol sin privilegios especiales con el que corren las consultas de la app. */
const ROL_APP = "authenticated";

/**
 * Ejecuta una consulta en nombre de un usuario.
 *
 * Hace dos cosas antes de la consulta, y las dos son imprescindibles:
 *
 * 1. `set local role authenticated`. La cadena de conexión es la del dueño de
 *    las tablas, y en Postgres **el dueño se salta el Row Level Security**.
 *    Sin este cambio de rol las políticas no se aplicarían y cualquier
 *    consulta vería los datos de todas las empresas.
 * 2. `request.jwt.claims` con el id del perfil, que es de donde lo lee
 *    `auth.uid()` dentro de la base.
 *
 * Van en la misma transacción que la consulta porque ambos ajustes son
 * locales a ella; sueltos no tendrían efecto. El servidor dice *quién*
 * pregunta; *qué* puede ver lo sigue decidiendo el RLS.
 */
export async function comoUsuario<T = Record<string, unknown>>(
  idUsuario: string | null,
  texto: string,
  params: unknown[] = [],
): Promise<T[]> {
  // Sin usuario van unos claims vacíos pero válidos: una cadena vacía no es
  // JSON y haría fallar la conversión dentro de `auth.uid()`.
  const claims = idUsuario ? JSON.stringify({ sub: idUsuario }) : "{}";

  const resultados = await sql.transaction((tx) => [
    tx.query(`set local role ${ROL_APP}`),
    tx.query("select set_config('request.jwt.claims', $1, true)", [claims]),
    tx.query(texto, params),
  ]);

  return resultados[2] as T[];
}

/** La primera fila, o null. Para consultas que esperan como mucho una. */
export async function unaFila<T = Record<string, unknown>>(
  idUsuario: string | null,
  texto: string,
  params: unknown[] = [],
): Promise<T | null> {
  const filas = await comoUsuario<T>(idUsuario, texto, params);
  return filas[0] ?? null;
}

/**
 * Consulta sin identidad, con el RLS igualmente puesto.
 *
 * Como `auth.uid()` devuelve null, las políticas no dejan ver nada. Sirve
 * para lo que ocurre antes de que exista sesión.
 */
export function sinSesion<T = Record<string, unknown>>(
  texto: string,
  params: unknown[] = [],
): Promise<T[]> {
  return comoUsuario<T>(null, texto, params);
}

/**
 * Consulta con los permisos del dueño, sin RLS.
 *
 * Es la única puerta que se salta las políticas y existe solo para el inicio
 * de sesión, que necesita comprobar una contraseña cuando todavía no hay
 * ninguna identidad que presentar. No la uses para leer datos de negocio:
 * para eso está `comoUsuario`, que sí respeta a quién pertenece cada cosa.
 */
export function comoServicio<T = Record<string, unknown>>(
  texto: string,
  params: unknown[] = [],
): Promise<T[]> {
  return sql.query(texto, params) as Promise<T[]>;
}
