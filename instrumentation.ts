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
    const { resumeAllPipelines, resumeOpenBatches, startPipelineSchedule } = await import("@/lib/pipeline");
    void resumeAllPipelines().catch((e) => console.error("[instrumentation] resumeAllPipelines failed:", e));
    // Then keep sweeping: adding URLs only writes "pending" rows, so without this
    // a paste-and-close-the-tab batch would sit untouched until the next restart.
    startPipelineSchedule();
    // Re-attach any Anthropic message batches left open by the previous process
    // (batch mode only; no-op otherwise) so their tailors finish + persist.
    void resumeOpenBatches().catch((e) => console.error("[instrumentation] resumeOpenBatches failed:", e));
  }
}
