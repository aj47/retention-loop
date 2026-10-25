export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { kick } = await import("@/lib/jobs/runner");
    // Resume any work interrupted by the last shutdown.
    void kick();
  }
}
