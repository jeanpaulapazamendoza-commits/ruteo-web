/**
 * Puente entre el navegador y el motor de optimización (FastAPI).
 *
 * El navegador llama a /api/motor/... (mismo origen), y este handler reenvía
 * la petición al motor. Dos ventajas frente a llamar al motor directamente:
 *   - No hay CORS que configurar.
 *   - La URL del motor es una variable de servidor: se cambia en el panel de
 *     Vercel y surte efecto sin recompilar la aplicación.
 */

const MOTOR =
  process.env.MOTOR_API_URL ??
  process.env.NEXT_PUBLIC_MOTOR_API ??
  "http://localhost:8010";

// Optimizar rutas puede tardar; damos margen antes de cortar.
export const maxDuration = 120;

const RUTAS_PERMITIDAS = new Set(["agrupar", "rutear", "tiendas-en-sector", "salud"]);

export async function POST(
  peticion: Request,
  // Catch-all OPCIONAL ([[...ruta]]): así /api/motor también existe y el
  // chequeo de salud no devuelve 404. `ruta` puede venir vacío.
  { params }: { params: Promise<{ ruta?: string[] }> },
) {
  const { ruta } = await params;
  const destino = (ruta ?? []).join("/");

  if (!RUTAS_PERMITIDAS.has(destino)) {
    return Response.json({ detail: `Ruta no permitida: ${destino}` }, { status: 404 });
  }

  const cuerpo = await peticion.text();

  try {
    const r = await fetch(`${MOTOR}/${destino}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: cuerpo,
      signal: AbortSignal.timeout(115_000),
    });
    const texto = await r.text();
    return new Response(texto, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const esTiempo = e instanceof Error && e.name === "TimeoutError";
    return Response.json(
      {
        detail: esTiempo
          ? "El motor tardó demasiado. Prueba con menos segundos de optimización o con el motor de línea recta."
          : `No se pudo contactar al motor de optimización (${MOTOR}). ` +
            "Si acabas de desplegarlo puede estar arrancando; reintenta en un minuto.",
      },
      { status: esTiempo ? 504 : 502 },
    );
  }
}

export async function GET() {
  try {
    const r = await fetch(`${MOTOR}/salud`, { signal: AbortSignal.timeout(8000) });
    return Response.json({ motor: MOTOR, ok: r.ok, estado: await r.json() });
  } catch {
    return Response.json({ motor: MOTOR, ok: false }, { status: 502 });
  }
}
