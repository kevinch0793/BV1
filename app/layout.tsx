import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentClient } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tailored Resume Platform",
  description: "Generate JD-tailored resumes across multiple profiles.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The sidebar only renders for authenticated clients; the login/register pages
  // (the only routes anonymous users reach) get a full-width layout.
  const client = await getCurrentClient();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <div className="flex min-h-screen flex-col md:flex-row">
          {client && <Sidebar isAdmin={client.role === "admin"} clientEmail={client.email} />}
          <main className="flex-1 px-6 py-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
