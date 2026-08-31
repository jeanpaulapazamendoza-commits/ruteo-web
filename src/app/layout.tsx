import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import RegistrarSW from "@/components/RegistrarSW";

/* Dos roles tipográficos: interfaz y dato numérico. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
  themeColor: "#101B2B",
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
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-[family-name:var(--font-inter)]">
        <RegistrarSW />
        {children}
      </body>
    </html>
  );
}
