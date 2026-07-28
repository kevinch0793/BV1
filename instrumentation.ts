// Runs once when the Next.js server process starts. We use it to kick off the
// automatic data-retention schedule (prune + VACUUM month-old activity daily),
// independent of any pipeline activity.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRetentionSchedule } = await import("@/lib/retention");
    startRetentionSchedule();
    // Auto-resume any unfinished pipeline work after a restart, so tailoring
    // continues on its own without each profile's dashboard being opened.
    // Detached (void) so it never blocks server startup.
    const { resumeAllPipelines } = await import("@/lib/pipeline");
    void resumeAllPipelines().catch((e) => console.error("[instrumentation] resumeAllPipelines failed:", e));
  }
}
