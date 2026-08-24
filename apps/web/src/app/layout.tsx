import type { Metadata } from "next";
import "./globals.css";
import { JetBrains_Mono, Geist } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/ui/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Slowpoke",
  description:
    "Visibility and control over how employees use AI tools, starting with a unified record of every prompt.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(jetbrainsMono.variable, "font-sans", geist.variable)}>
      <body className="min-h-full antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
