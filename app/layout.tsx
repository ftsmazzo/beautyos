import { Roboto } from "next/font/google";
import "@tabler/core/dist/css/tabler.min.css";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
      <body className={`${roboto.variable} ${roboto.className}`}>{children}</body>
    </html>
  );
}
