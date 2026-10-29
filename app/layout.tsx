import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import "./station.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
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
    <html lang="pt-BR" data-theme="salon" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("beautyos-theme");if(t==="barber"||t==="salon")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable} ${plexSans.className}`}>{children}</body>
    </html>
  );
}
