import "./globals.css";

export const metadata = {
  title: "BeautyOS",
  description: "Painel operacional da casa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
