"use server";

import { signOut } from "@/auth";

/**
 * Cierra la sesión desde el servidor.
 *
 * Va por acción de servidor y no por el cliente de Auth.js para no arrastrar
 * su proveedor de sesión al navegador: la aplicación lee la sesión siempre en
 * el servidor, así que en el cliente no hace falta nada de eso.
 */
export async function salir() {
  await signOut({ redirectTo: "/login" });
}
