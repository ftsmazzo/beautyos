import { Inter } from "next/font/google";
import "./globals.css";

/** Inter = face padrão dos dashboards Tabler / shadcn-admin — legível no balcão. */
const inter = Inter({
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
      <body className={`${inter.variable} ${inter.className}`}>{children}</body>
    </html>
  );
}
