import Image from "next/image";

/**
 * El logotipo, en las tres versiones que usa la aplicación.
 *
 * La guía de marca fija cuál va en cada sitio y aquí se cumple sin que cada
 * pantalla tenga que acordarse: horizontal sobre fondo claro, reverso sobre
 * los azules oscuros, e isotipo cuando no hay ancho para la palabra —la barra
 * lateral plegada, la cabecera del conductor, el icono instalado—.
 *
 * Se sirve como SVG y no como texto porque el wordmark está convertido a
 * curvas: no depende de que ninguna tipografía llegue a cargar.
 */
export default function Logo({
  variante = "horizontal",
  alto = 32,
  className = "",
}: {
  variante?: "horizontal" | "reverso" | "isotipo";
  /** Alto en píxeles; el ancho lo da la proporción del archivo. */
  alto?: number;
  className?: string;
}) {
  const fuente = {
    horizontal: "/marca/logo.svg",
    reverso: "/marca/logo-reverso.svg",
    isotipo: "/marca/isotipo.svg",
  }[variante];

  // 1800×512 el horizontal, 512×512 el isotipo.
  const proporcion = variante === "isotipo" ? 1 : 1800 / 512;

  return (
    <Image
      src={fuente}
      alt="PuriqGo"
      width={Math.round(alto * proporcion)}
      height={alto}
      priority
      className={className}
    />
  );
}
