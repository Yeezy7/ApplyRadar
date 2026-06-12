import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let connection: InstanceType<typeof IORedis> | null = null;
let checkQueue: Queue | null = null;

function getConnection(): InstanceType<typeof IORedis> {
  if (!connection) {
    connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getCheckQueue(): Queue | null {
  if (!checkQueue) {
    try {
      const conn = getConnection();
      checkQueue = new Queue("tracking-check", { connection: conn as any });
    } catch (error) {
      console.error("[queue] Failed to create queue:", error);
      return null;
    }
  }
  return checkQueue;
}

export async function addCheckJob(target: any, token: string): Promise<boolean> {
  const queue = getCheckQueue();
  if (!queue) {
    console.warn("[queue] Queue not available, skipping job");
    return false;
  }

  try {
    await queue.add("check", {
      ...target,
      token,
    }, {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });
    return true;
  } catch (error) {
    console.error("[queue] Failed to add job:", error);
    return false;
  }
}

export async function addBatchCheckJobs(targets: any[], token: string): Promise<number> {
  const queue = getCheckQueue();
  if (!queue) {
    console.warn("[queue] Queue not available, skipping jobs");
    return 0;
  }

  let added = 0;
  for (const target of targets) {
    try {
      await queue.add("check", {
        ...target,
        token,
      }, {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      });
      added++;
    } catch (error) {
      console.error("[queue] Failed to add job for target:", target.id, error);
    }
  }

  return added;
}

export async function closeQueue(): Promise<void> {
  if (checkQueue) {
    await checkQueue.close();
    checkQueue = null;
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
