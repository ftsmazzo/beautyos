export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { databaseReady } = await import("@/db/client");
    await databaseReady();
  }
}
