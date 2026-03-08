import "./globals.css";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";

export const metadata = {
  title: "SIXFL",
  description: "Six-a-side football league platform",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0f14] text-white flex flex-col">
        <SiteHeader />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-8">
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}