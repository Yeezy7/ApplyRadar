import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { checkTarget, type CheckTarget, type CheckResult } from "./checker.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const WORKER_SERVICE_TOKEN = process.env.WORKER_SERVICE_TOKEN || "";
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);
const RATE_LIMIT = parseInt(process.env.WORKER_RATE_LIMIT || "30", 10);

const ts = () => new Date().toISOString();

console.log(`[${ts()}] [worker] Starting ApplyRadar Worker...`);
// 安全：不输出完整 Redis URL（可能含密码）
const redisHost = REDIS_URL.replace(/\/\/[^@]*@/, '//***@');
console.log(`[${ts()}] [worker] Redis: ${redisHost}`);
console.log(`[${ts()}] [worker] Server: ${SERVER_URL}`);
console.log(`[${ts()}] [worker] Service token: ${WORKER_SERVICE_TOKEN ? "configured" : "NOT configured"}`);
console.log(`[${ts()}] [worker] Concurrency: ${CONCURRENCY}`);

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Create queue for scheduling
const checkQueue = new Queue("tracking-check", { connection: connection as any });

// Create worker
const worker = new Worker(
  "tracking-check",
  async (job) => {
    const target = job.data as CheckTarget;
    console.log(`[${ts()}] [worker] Checking target ${target.id}: ${target.status_url}`);

    const result = await checkTarget(target);
    console.log(`[${ts()}] [worker] Target ${target.id} result:`, {
      success: result.success,
      loginState: result.loginState,
      hasError: !!result.errorMessage,
    });

    // Report result back to server using service token
    try {
      const response = await fetch(`${SERVER_URL}/api/tracking/${target.id}/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WORKER_SERVICE_TOKEN}`,
        },
        signal: AbortSignal.timeout(30000), // 30 秒超时，防止挂起
        body: JSON.stringify({
          status: result.success ? "success" : "failed",
          login_state: result.loginState,
          raw_status: result.rawStatus,
          normalized_status: result.normalizedStatus,
          confidence: result.confidence,
          page_hash: result.pageHash,
          error_message: result.errorMessage,
          content_changed: result.contentChanged,
          ai_used: 0,
        }),
      });

      if (!response.ok) {
        console.error(`[${ts()}] [worker] Failed to report result for ${target.id}:`, await response.text());
      }
    } catch (error) {
      console.error(`[${ts()}] [worker] Failed to report result for ${target.id}:`, error);
    }

    return result;
  },
  {
    connection: connection as any,
    concurrency: CONCURRENCY,
    limiter: {
      max: RATE_LIMIT,
      duration: 60000,
    },
  }
);

worker.on("completed", (job, result) => {
  console.log(`[${ts()}] [worker] Job ${job.id} completed:`, result);
});

worker.on("failed", (job, error) => {
  console.error(`[${ts()}] [worker] Job ${job?.id} failed:`, error);
});

worker.on("error", (error) => {
  console.error(`[${ts()}] [worker] Worker error:`, error);
});

// Handle graceful shutdown（带超时，防止进程挂起）
async function gracefulShutdown(signal: string) {
  console.log(`[${ts()}] [worker] Received ${signal}, shutting down...`);
  const shutdownTimeout = setTimeout(() => {
    console.error(`[${ts()}] [worker] Shutdown timed out, forcing exit`);
    process.exit(1);
  }, 10000);

  try {
    await worker.close();
    await connection.quit();
  } catch (e) {
    console.error(`[${ts()}] [worker] Error during shutdown:`, e);
  }
  clearTimeout(shutdownTimeout);
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

console.log(`[${ts()}] [worker] Worker started, waiting for jobs...`);

// Export queue for external use
export { checkQueue };
