import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Roboto } from "next/font/google";
import "./globals.css";
import RegistrarSW from "@/components/RegistrarSW";

/*
 * La tipografía de la interfaz es la del sistema de referencia: DM Sans en
 * las pantallas de tabla y Roboto en la de Actividad, que allí conserva su
 * diseño anterior. Se cargan las dos para que cada pantalla se parezca a la
 * suya y no a un promedio de ambas.
 */
const inter = DM_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PuriqGo — Planificación last mile",
  description: "Agrupación de tiendas por zonas y ruteo óptimo de despacho.",
  manifest: "/manifest.json",
  // Para que en iPhone se abra a pantalla completa al añadirla al inicio.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Reparto" },
};

export const viewport: Viewport = {
  themeColor: "#132045",
  // El móvil del conductor se usa con una mano y a veces con guantes: que no
  // se descoloque la vista al enfocar un campo.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${roboto.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-[family-name:var(--font-inter)]">
        <RegistrarSW />
        {children}
      </body>
    </html>
  );
}
