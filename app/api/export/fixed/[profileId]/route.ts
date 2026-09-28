import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentClient } from "@/lib/auth";
import { resumeFileName } from "@/lib/export/filename";
import { extensionOf } from "@/lib/fixedResume";

export const dynamic = "force-dynamic";

/**
 * Serve a profile's fixed resume — the file a "normal"-plan candidate attaches
 * to every application.
 *
 * Deliberately under /api/export/, because the browser extension only tidies
 * downloads whose URL contains that path: it renames them to the candidate's
 * "First Last.pdf" and overwrites the previous copy. Serving this from anywhere
 * else would work but would give normal-plan users the pile of "resume (3).pdf"
 * files the extension exists to prevent.
 *
 * The path is /api/export/fixed/<profileId>, one segment deeper than the
 * tailored route's /api/export/<tailoredId>, so the two never collide.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const client = await getCurrentClient();
  if (!client) return new NextResponse("Unauthorized", { status: 401 });

  // Admins can fetch any profile's resume; clients only their own.
  const profile = await prisma.profile.findFirst({
    where: client.role === "admin" ? { id: profileId } : { id: profileId, clientId: client.id },
    select: { fullName: true, fixedResume: true },
  });
  if (!profile) return new NextResponse("Not found", { status: 404 });
  const file = profile.fixedResume;
  if (!file) return new NextResponse("No fixed resume uploaded for this profile", { status: 404 });

  // Same naming as a tailored export: a stable "First Last.<ext>" so a
  // re-download replaces the previous file instead of piling up copies.
  const filename = resumeFileName(profile.fullName, extensionOf(file.filename) || "pdf");
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
      // The file only changes when re-uploaded, but it is per-account data, so
      // never let a shared cache hold it.
      "Cache-Control": "private, no-store",
    },
  });
}
