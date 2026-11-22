/**
 * Los iconos de la app del conductor.
 *
 * Trazo fino y un solo color, el del texto que los rodea: los mismos del
 * resto de la web, en vez de los emoji y las flechas de teclado de antes,
 * que cada teléfono pintaba a su manera.
 */
type Props = { tam?: number; className?: string };

function Trazo({ tam = 20, className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconoAtras = (p: Props) => <Trazo {...p}><path d="M15 5l-7 7 7 7" /></Trazo>;
export const IconoAdelante = (p: Props) => <Trazo {...p}><path d="M9 5l7 7-7 7" /></Trazo>;
export const IconoAbajo = (p: Props) => <Trazo {...p}><path d="M5 9l7 7 7-7" /></Trazo>;
export const IconoMenu = (p: Props) => (
  <Trazo {...p}><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" /></Trazo>
);
export const IconoIr = (p: Props) => <Trazo {...p}><path d="M21 3L3 10.5l7.5 3 3 7.5z" /></Trazo>;
export const IconoTelefono = (p: Props) => (
  <Trazo {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
  </Trazo>
);
export const IconoCheck = (p: Props) => <Trazo {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Trazo>;
export const IconoCerrar = (p: Props) => <Trazo {...p}><path d="M6 6l12 12M18 6L6 18" /></Trazo>;
export const IconoCamara = (p: Props) => (
  <Trazo {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Trazo>
);
export const IconoLapiz = (p: Props) => (
  <Trazo {...p}><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></Trazo>
);
export const IconoMapa = (p: Props) => (
  <Trazo {...p}><path d="M9 4L3 6.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13" /></Trazo>
);
