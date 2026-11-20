import { Suspense } from "react";
import { HAY_GOOGLE } from "@/auth";
import FormularioLogin from "@/components/FormularioLogin";

export default function PaginaLogin() {
  return (
    <Suspense fallback={<div className="p-10 text-ink-3">Cargando…</div>}>
      {/* Si el servidor no tiene credenciales de Google, el botón no se
          muestra: ofrecerlo acabaría en una pantalla de error de Google. */}
      <FormularioLogin hayGoogle={HAY_GOOGLE} />
    </Suspense>
  );
}
