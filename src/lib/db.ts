import "server-only";
import { neon, types as pg } from "@neondatabase/serverless";

/**
 * Cómo llegan los valores de Postgres a JavaScript.
 *
 * El driver sigue la convención de node-postgres, que no es la que traía la
 * API REST de Supabase. Son diferencias silenciosas —compilan igual y
 * revientan al pintar—, así que se corrigen aquí, una vez, en lugar de en
 * cada pantalla:
 *
 * - `bigint` y `numeric` llegaban como cadena. Un `count(*)` se convertía en
 *   `"7"`, y `"7".toLocaleString()` no agrupa miles ni `.toFixed(1)` existe.
 * - `date`, `time` y `timestamptz` llegaban como objetos `Date`, que React no
 *   sabe pintar: «Objects are not valid as a React child».
 *
 * Las fechas y horas se dejan en texto, que es lo que el código espera y
 * recorta con `slice(0, 5)`. Los instantes se normalizan a ISO 8601 porque
 * `new Date(...)` sobre el formato de Postgres («2026-11-19 12:30:00+00»)
 * depende del navegador.
 */
const TAL_CUAL = (v: string) => v;

const tipos = {
  getTypeParser(id: number, formato?: "text" | "binary") {
    switch (id) {
      case pg.builtins.INT8:
      case pg.builtins.NUMERIC:
        return Number;
      case pg.builtins.DATE:
      case pg.builtins.TIME:
      case pg.builtins.TIMETZ:
        return TAL_CUAL;
      case pg.builtins.TIMESTAMP:
      case pg.builtins.TIMESTAMPTZ:
        return (v: string) => {
          const fecha = pg.getTypeParser(id, formato)(v) as Date;
          return fecha instanceof Date && !isNaN(+fecha) ? fecha.toISOString() : v;
        };
      default:
        return pg.getTypeParser(id, formato);
    }
  },
};

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

/**
 * Los conversores van en cada consulta, no en `neon(...)`.
 *
 * El driver los acepta en tres sitios y solo uno funciona. En la fábrica
 * `neon(url, { types })` se ignoran, y en `sql.transaction(..., { types })`
 * también: la implementación de la transacción solo mira `fetchOptions`,
 * `arrayMode`, `fullResults`, `isolationLevel`, `readOnly` y `deferrable`.
 * Lo que sí viaja son las opciones de cada consulta suelta, que la
 * transacción recoge una por una. Comprobado contra la base.
 */
const OPCIONES = { types: tipos };

/**
 * El tercer argumento de `query` dentro de una transacción.
 *
 * La implementación lo usa —de ahí sale el array de opciones por consulta—,
 * pero la declaración de tipos de la versión instalada solo describe dos
 * parámetros. Esto apunta a la firma real en lugar de desactivar el
 * comprobador en la línea de la llamada.
 */
type ConsultaConOpciones = (
  texto: string,
  params?: unknown[],
  opciones?: typeof OPCIONES,
) => ReturnType<typeof sql.query>;

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
    (tx.query as unknown as ConsultaConOpciones)(texto, params, OPCIONES),
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
  return sql.query(texto, params, OPCIONES) as Promise<T[]>;
}
