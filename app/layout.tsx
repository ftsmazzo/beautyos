import { Source_Sans_3 } from "next/font/google";
import "@tabler/core/dist/css/tabler.min.css";
import "./globals.css";

/** Source Sans 3 no balcão; tokens de componente vêm do @tabler/core. */
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
