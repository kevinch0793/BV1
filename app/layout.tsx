import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { NoticeBanner } from "@/components/NoticeBanner";
import { getCurrentClient } from "@/lib/auth";
import { getNotice } from "@/lib/settings";

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
  // Admin notice: fetched only for signed-in clients, so the login page stays a
  // single query and anonymous visitors never see internal announcements.
  const notice = client ? await getNotice() : null;

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <div className="flex min-h-screen flex-col md:flex-row">
          {client && <Sidebar isAdmin={client.role === "admin"} clientEmail={client.email} />}
          <main className="flex-1 px-6 py-8">
            <div className="mx-auto max-w-6xl">
              {notice && <NoticeBanner text={notice.text} kind={notice.kind} version={notice.version} />}
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
