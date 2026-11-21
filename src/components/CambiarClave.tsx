"use client";

import { useState } from "react";
import { rpc } from "@/app/acciones/rpc";
import { Tarjeta } from "@/components/ui";

/**
 * Cambio de la propia contraseña.
 *
 * La comprobación de verdad la hace la base: `cambiar_mi_clave` confirma la
 * anterior y cifra la nueva ahí dentro, así que ninguna de las dos se guarda
 * en el servidor de la aplicación. Lo de aquí solo evita el viaje cuando el
 * formulario ya se ve mal rellenado.
 */
export default function CambiarClave({ tieneClave }: { tieneClave: boolean }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setListo(false);

    if (nueva.length < 8) {
      setError("La contraseña nueva debe tener al menos 8 caracteres.");
      return;
    }
    if (nueva !== repetida) {
      setError("Las dos contraseñas nuevas no coinciden.");
      return;
    }

    setGuardando(true);
    try {
      await rpc("cambiar_mi_clave", { p_actual: actual, p_nueva: nueva });
      setActual("");
      setNueva("");
      setRepetida("");
      setListo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta className="max-w-[460px] p-5">
      <h3 className="text-[15px] font-bold tracking-tight">
        {tieneClave ? "Cambiar mi contraseña" : "Ponerle una contraseña a mi cuenta"}
      </h3>
      <p className="mt-1 text-[13px] text-ink-2">
        {tieneClave
          ? "La sesión no se cierra: seguirás dentro en este navegador."
          : "Entraste con Google y todavía no tienes contraseña. Ponle una si quieres poder entrar también sin Google, por ejemplo desde un teléfono sin tu cuenta."}
      </p>

      <form onSubmit={enviar} className="mt-4 space-y-3.5">
        {/* Quien entró con Google puede no tener ninguna que confirmar. */}
        {tieneClave && (
          <Campo
            etiqueta="Contraseña actual"
            valor={actual}
            onChange={setActual}
            autoComplete="current-password"
          />
        )}
        <Campo
          etiqueta="Contraseña nueva"
          valor={nueva}
          onChange={setNueva}
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
        />
        <Campo
          etiqueta="Repite la nueva"
          valor={repetida}
          onChange={setRepetida}
          autoComplete="new-password"
        />

        {error && (
          <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
            {error}
          </p>
        )}
        {listo && (
          <p className="rounded-[10px] border border-ok/30 bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
            ✓ Contraseña guardada. Úsala la próxima vez que entres.
          </p>
        )}

        <button
          type="submit"
          disabled={guardando}
          className="w-full rounded-full border border-amber-600 bg-amber px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-amber-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </Tarjeta>
  );
}

function Campo({
  etiqueta,
  valor,
  onChange,
  placeholder,
  autoComplete,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </span>
      <input
        type="password"
        required
        value={valor}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[4px] border border-line-strong bg-surface px-3 py-2.5 text-[14px] outline-none transition focus:border-amber-600"
      />
    </label>
  );
}
