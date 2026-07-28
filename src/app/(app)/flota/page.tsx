import { BarraSuperior, Tarjeta, EstadoVacio } from "@/components/ui";

export default function Pagina() {
  return (
    <>
      <BarraSuperior migaja="Operación" titulo="Flota" />
      <div className="p-4">
        <Tarjeta>
          <EstadoVacio
            icono="▣"
            titulo="Flota"
            descripcion="Esta sección se construye en la siguiente etapa, sobre las mismas tablas de Supabase que ya están creadas."
          />
        </Tarjeta>
      </div>
    </>
  );
}
