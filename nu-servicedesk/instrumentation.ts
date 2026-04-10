// Design Ref: §6 — BullMQ Worker 시작점 + Graceful Shutdown [V2.1]
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorkers, stopWorkers } = await import('./jobs/worker');
    startWorkers();

    // Graceful Shutdown (V2.1)
    process.on('SIGTERM', async () => {
      console.log('[SIGTERM] Graceful shutdown started...');
      await stopWorkers(); // worker.close() + 진행 중 잡 완료 대기 (최대 30초)
      process.exit(0);
    });
  }
}
