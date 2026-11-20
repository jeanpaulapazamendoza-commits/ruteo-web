"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { entrar, entrarConGoogle, registrar } from "@/app/login/acciones";
import Logo from "@/components/Logo";

type Modo = "entrar" | "registrar";

/**
 * Lo que Google puede devolver al volver del rodeo, en castellano.
 *
 * `AccessDenied` es el caso que de verdad ocurre: la cuenta de Google existe
 * pero ese correo no está dado de alta aquí, o está desactivado.
 */
const ERROR_GOOGLE: Record<string, string> = {
  AccessDenied:
    "Ese correo de Google no está dado de alta en PuriqGo, o su cuenta está desactivada. Pídele a tu administrador que te agregue desde Equipo.",
  OAuthAccountNotLinked:
    "Ese correo ya entra con contraseña. Usa el formulario de abajo.",
  Configuration:
    "La entrada con Google no está bien configurada en el servidor. Avisa al administrador.",
};

export default function FormularioLogin({ hayGoogle = false }: { hayGoogle?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const volverA = params.get("volver") || "/planificador";
  const errorUrl = params.get("error");

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

    try {
      const r =
        modo === "entrar"
          ? await entrar(correo, clave)
          : await registrar(empresa, nombre, correo, clave);

      if (!r.ok) {
        setError(traducir(r.error));
        return;
      }

      // `refresh` antes de navegar: el layout lee la sesión en el servidor y
      // sin esto renderizaría con la anterior, que todavía está vacía.
      router.refresh();
      router.push(volverA);
    } catch (err) {
      setError(traducir(err instanceof Error ? err.message : String(err)));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="grid min-h-full lg:grid-cols-2">
      {/* Panel de marca */}
      <section className="hidden flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo variante="reverso" alto={46} />
          <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#7e90a8]">
            Last mile
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
          {/* En móvil no existe el panel oscuro de la izquierda, así que aquí
              va la versión horizontal sobre fondo claro. */}
          <div className="mb-7 lg:hidden">
            <Logo variante="horizontal" alto={48} />
          </div>

          <h2 className="text-[26px] font-extrabold tracking-tight">
            {modo === "entrar" ? "Iniciar sesión" : "Crear cuenta"}
          </h2>
          <p className="mt-1.5 text-[14px] text-ink-2">
            {modo === "entrar"
              ? "Accede al planificador de tu empresa."
              : "Se creará tu empresa y quedarás como administrador."}
          </p>

          {errorUrl && (
            <p className="mt-5 rounded-[10px] border border-bad/30 bg-bad-bg px-3 py-2.5 text-[13px] text-bad">
              {ERROR_GOOGLE[errorUrl] ?? "No se pudo entrar. Inténtalo de nuevo."}
            </p>
          )}

          {/* Entrar con Google va arriba y en modo «entrar»: al registrarse
              hace falta el nombre de la empresa, que Google no sabe. */}
          {hayGoogle && modo === "entrar" && (
            <>
              <button
                type="button"
                disabled={cargando}
                onClick={() => {
                  setCargando(true);
                  void entrarConGoogle(volverA);
                }}
                className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-[10px] border border-line-strong bg-surface px-4 py-2.5 text-[14px] font-semibold transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
              >
                <IconoGoogle />
                Entrar con Google
              </button>

              <div className="my-5 flex items-center gap-3 text-[11.5px] uppercase tracking-wide text-ink-3">
                <span className="h-px flex-1 bg-line" />o con tu contraseña
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form
            onSubmit={enviar}
            className={`space-y-4 ${hayGoogle && modo === "entrar" ? "" : "mt-7"}`}
          >
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
              placeholder="Mínimo 8 caracteres"
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
              className="w-full rounded-[10px] border border-amber-600 bg-amber px-4 py-2.5 text-[14px] font-semibold text-navy-900 transition hover:bg-amber-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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

/** La «G» de Google, con sus cuatro colores de marca. */
function IconoGoogle() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.9c-.5 2.8-2.1 5.1-4.4 6.7v5.6h7.1c4.2-3.8 6.5-9.5 6.5-16.5z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.6-5.3l-7.1-5.6c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.8C8 41.3 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.6 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.8H4.3C2.8 17 2 20.4 2 24s.8 7 2.3 9.9l7.3-5.8z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 8 6.7 4.3 14.1l7.3 5.8c1.7-5.2 6.6-9.1 12.4-9.1z"
      />
    </svg>
  );
}

/**
 * La base ya habla español: sus `raise exception` son el mensaje que ve el
 * usuario. Solo quedan aquí los fallos de infraestructura, que llegan en
 * inglés y no dicen nada útil a quien está intentando entrar.
 */
function traducir(mensaje: string) {
  const m = mensaje.toLowerCase();
  if (m.includes("ya tiene una cuenta"))
    return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (m.includes("fetch failed") || m.includes("econnrefused") || m.includes("timeout"))
    return "No hay conexión con el servidor. Inténtalo de nuevo en un momento.";
  return mensaje;
}
