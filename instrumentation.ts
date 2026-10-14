export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const state = globalThis as { beautyosClock?: boolean };
  if (state.beautyosClock) return;
  state.beautyosClock = true;
  const { materializeDueRecurrences } = await import("@/finance/recurrence");
  const run = () => {
    materializeDueRecurrences().catch((error) => {
      console.error("recorrencia", error);
    });
  };
  run();
  const timer = setInterval(run, 60 * 1000);
  timer.unref();
}
