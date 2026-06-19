import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tailored Resume Platform",
  description: "Generate JD-tailored resumes across multiple profiles.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <header className="no-print border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-neutral-900">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-sky-700 text-sm text-white">R</span>
              Tailored Resume
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
                Dashboard
              </Link>
              <Link href="/profiles" className="rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
                Profiles
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
