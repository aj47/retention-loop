import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { directorMode, DIRECTOR_MODEL } from "@/lib/director/model";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Retention Loop",
  description: "An AI Director that learns from everything you've published.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const mode = directorMode();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full font-sans">
        <Nav mode={mode} model={DIRECTOR_MODEL} />
        <main className="min-w-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
