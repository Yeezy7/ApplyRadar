import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { checkTarget, type CheckTarget, type CheckResult } from "./checker.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);
const RATE_LIMIT = parseInt(process.env.WORKER_RATE_LIMIT || "30", 10);

const ts = () => new Date().toISOString();

console.log(`[${ts()}] [worker] Starting ApplyRadar Worker...`);
console.log(`[${ts()}] [worker] Redis: ${REDIS_URL}`);
console.log(`[${ts()}] [worker] Server: ${SERVER_URL}`);
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

    // Report result back to server
    try {
      const response = await fetch(`${SERVER_URL}/api/tracking/${target.id}/runs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${job.data.token}`,
        },
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

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log(`[${ts()}] [worker] Shutting down...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log(`[${ts()}] [worker] Shutting down...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
});

console.log(`[${ts()}] [worker] Worker started, waiting for jobs...`);

// Export queue for external use
export { checkQueue };
