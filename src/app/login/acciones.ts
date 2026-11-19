"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { comoServicio } from "@/lib/db";

export type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Inicia sesión.
 *
 * `redirect: false` porque la redirección la hace el formulario: así un fallo
 * de credenciales vuelve con un mensaje en vez de recargar la página entera.
 */
export async function entrar(correo: string, clave: string): Promise<Resultado> {
  try {
    await signIn("credentials", {
      email: correo,
      clave,
      redirect: false,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) {
      // No se distingue entre correo inexistente y contraseña equivocada:
      // decirlo ayudaría a averiguar qué correos existen.
      return { ok: false, error: "Correo o contraseña incorrectos." };
    }
    throw e;
  }
}

/** Alta de una empresa nueva con su primer administrador, y entra. */
export async function registrar(
  empresa: string,
  nombre: string,
  correo: string,
  clave: string,
): Promise<Resultado> {
  try {
    await comoServicio("select public.registrar_empresa($1, $2, $3, $4)", [
      empresa,
      nombre,
      correo,
      clave,
    ]);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return { ok: false, error: mensaje };
  }

  return entrar(correo, clave);
}
