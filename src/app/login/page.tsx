import { Suspense } from "react";
import FormularioLogin from "@/components/FormularioLogin";

export default function PaginaLogin() {
  return (
    <Suspense fallback={<div className="p-10 text-ink-3">Cargando…</div>}>
      <FormularioLogin />
    </Suspense>
  );
}
