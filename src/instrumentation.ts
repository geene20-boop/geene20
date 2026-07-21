export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureBackupScheduler } = await import("@/lib/backup");
    ensureBackupScheduler();
    const { ensureBackupEmailScheduler } = await import("@/lib/backupMailer");
    ensureBackupEmailScheduler();
  }
}
