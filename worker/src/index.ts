import "dotenv/config";
import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { checkTarget, type CheckTarget, type CheckResult } from "./checker.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);

console.log("[worker] Starting ApplyRadar Worker...");
console.log(`[worker] Redis: ${REDIS_URL}`);
console.log(`[worker] Server: ${SERVER_URL}`);
console.log(`[worker] Concurrency: ${CONCURRENCY}`);

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Create queue for scheduling
const checkQueue = new Queue("tracking-check", { connection: connection as any });

// Create worker
const worker = new Worker(
  "tracking-check",
  async (job) => {
    const target = job.data as CheckTarget;
    console.log(`[worker] Checking target ${target.id}: ${target.status_url}`);

    const result = await checkTarget(target);
    console.log(`[worker] Target ${target.id} result:`, {
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
        console.error(`[worker] Failed to report result for ${target.id}:`, await response.text());
      }
    } catch (error) {
      console.error(`[worker] Failed to report result for ${target.id}:`, error);
    }

    return result;
  },
  {
    connection: connection as any,
    concurrency: CONCURRENCY,
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute
    },
  }
);

worker.on("completed", (job, result) => {
  console.log(`[worker] Job ${job.id} completed:`, result);
});

worker.on("failed", (job, error) => {
  console.error(`[worker] Job ${job?.id} failed:`, error);
});

worker.on("error", (error) => {
  console.error("[worker] Worker error:", error);
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("[worker] Shutting down...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[worker] Shutting down...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

console.log("[worker] Worker started, waiting for jobs...");

// Export queue for external use
export { checkQueue };
