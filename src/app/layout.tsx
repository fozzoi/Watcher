import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Watcher - Torrent Streamer",
  description: "Seamlessly search and stream media content.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={outfit.variable}>
        <div className="layout-container">
          <Navigation />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
