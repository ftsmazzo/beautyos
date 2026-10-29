import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

/** Source Sans 3 — legível no balcão, menos agressiva que Inter. */
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
});

export const metadata = {
  title: "BeautyOS",
  description: "Painel operacional da casa",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BeautyOS",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${sourceSans.variable} ${sourceSans.className}`}>{children}</body>
    </html>
  );
}
