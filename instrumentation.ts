// Runs once when the Next.js server process starts. We use it to kick off the
// automatic data-retention schedule (prune + VACUUM month-old activity daily),
// independent of any pipeline activity.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRetentionSchedule } = await import("@/lib/retention");
    startRetentionSchedule();
  }
}
