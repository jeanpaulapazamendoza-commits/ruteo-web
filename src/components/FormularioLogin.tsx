"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Modo = "entrar" | "registrar";

export default function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const volverA = params.get("volver") || "/planificador";

  const [modo, setModo] = useState<Modo>("entrar");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setCargando(true);
    const supabase = crearClienteNavegador();

    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({
          email: correo,
          password: clave,
        });
        if (error) throw error;
        router.push(volverA);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: correo,
          password: clave,
          // El trigger de la base lee estos datos para crear la empresa
          // y el perfil automáticamente.
          options: { data: { nombre, empresa } },
        });
        if (error) throw error;
        if (data.session) {
          router.push(volverA);
          router.refresh();
        } else {
          setAviso(
            "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.",
          );
          setModo("entrar");
        }
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      setError(traducir(mensaje));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="grid min-h-full lg:grid-cols-2">
      {/* Panel de marca */}
      <section className="hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-gradient-to-br from-amber to-amber-600 text-lg font-extrabold text-[#231403]">
            R
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight">
              RuteoTiendas
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7e90a8]">
              Last mile
            </div>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-balance">
            Planifica el despacho del día en minutos.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#b4c2d6]">
            Agrupa tus tiendas por zona respetando la capacidad de cada
            vehículo, calcula la ruta óptima por calles reales y envíala a tus
            conductores.
          </p>
          <ul className="mt-8 space-y-3 text-[13.5px] text-[#b4c2d6]">
            {[
              "Agrupamiento por capacidad, bultos o flota",
              "Ventanas horarias y hora estimada de llegada",
              "Prueba de entrega con foto y GPS",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11.5px] text-[#5c6e88]">
          Optimización de rutas para distribución urbana.
        </p>
      </section>

      {/* Formulario */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-gradient-to-br from-amber to-amber-600 text-lg font-extrabold text-[#231403]">
              R
            </div>
          </div>

          <h2 className="text-[26px] font-extrabold tracking-tight">
            {modo === "entrar" ? "Iniciar sesión" : "Crear cuenta"}
          </h2>
          <p className="mt-1.5 text-[14px] text-ink-2">
            {modo === "entrar"
              ? "Accede al planificador de tu empresa."
              : "Se creará tu empresa y quedarás como administrador."}
          </p>

          <form onSubmit={enviar} className="mt-7 space-y-4">
            {modo === "registrar" && (
              <>
                <Campo
                  etiqueta="Tu nombre"
                  valor={nombre}
                  onChange={setNombre}
                  placeholder="Jean Apaza"
                  requerido
                />
                <Campo
                  etiqueta="Empresa"
                  valor={empresa}
                  onChange={setEmpresa}
                  placeholder="Distribuidora Lima Sur"
                  requerido
                />
              </>
            )}
            <Campo
              etiqueta="Correo"
              tipo="email"
              valor={correo}
              onChange={setCorreo}
              placeholder="tu@empresa.com"
              requerido
            />
            <Campo
              etiqueta="Contraseña"
              tipo="password"
              valor={clave}
              onChange={setClave}
              placeholder="Mínimo 6 caracteres"
              requerido
            />

            {error && (
              <p className="rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
                {error}
              </p>
            )}
            {aviso && (
              <p className="rounded-[10px] border border-ok/30 bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
                {aviso}
              </p>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-[10px] border border-amber-600 bg-amber px-4 py-2.5 text-[14px] font-semibold text-[#231403] transition hover:bg-amber-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cargando
                ? "Un momento…"
                : modo === "entrar"
                  ? "Entrar"
                  : "Crear cuenta"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-ink-2">
            {modo === "entrar" ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
            <button
              type="button"
              onClick={() => {
                setModo(modo === "entrar" ? "registrar" : "entrar");
                setError(null);
                setAviso(null);
              }}
              className="font-semibold text-amber-600 underline underline-offset-2"
            >
              {modo === "entrar" ? "Crear una" : "Iniciar sesión"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function Campo({
  etiqueta,
  valor,
  onChange,
  tipo = "text",
  placeholder,
  requerido,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  placeholder?: string;
  requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {etiqueta}
      </span>
      <input
        type={tipo}
        value={valor}
        required={requerido}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-[14px] text-ink outline-none transition placeholder:text-ink-3/70 focus:border-amber"
      />
    </label>
  );
}

/** Mensajes de Supabase en español y en términos accionables. */
function traducir(mensaje: string) {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Correo o contraseña incorrectos.";
  if (m.includes("user already registered"))
    return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (m.includes("password should be at least"))
    return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("email not confirmed"))
    return "Confirma tu correo antes de entrar.";
  if (m.includes("unable to validate email"))
    return "Ese correo no parece válido.";
  return mensaje;
}
