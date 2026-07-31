"use client";

import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

export default function CuentaBloqueada({
  email,
  sinPerfil,
}: {
  email: string;
  sinPerfil: boolean;
}) {
  const router = useRouter();

  async function salir() {
    await crearClienteNavegador().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="w-full max-w-[420px] rounded-[16px] border border-line bg-surface p-7 text-center shadow-[0_4px_16px_rgba(16,27,43,0.08)]">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-[12px] bg-bad-bg text-2xl">
          🔒
        </div>
        <h1 className="mt-4 text-[19px] font-bold tracking-tight">
          {sinPerfil ? "Tu cuenta no está asignada" : "Cuenta desactivada"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {sinPerfil
            ? "Tu usuario aún no pertenece a ninguna empresa. Pide al administrador que te agregue a su equipo."
            : "Un administrador de tu empresa desactivó tu acceso. Si crees que es un error, contáctalo para que lo reactive."}
        </p>
        <p className="num mt-3 text-[12px] text-ink-3">{email}</p>
        <button
          onClick={salir}
          className="mt-5 w-full rounded-[10px] border border-line-strong bg-surface px-4 py-2.5 text-[14px] font-semibold transition hover:bg-canvas"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
