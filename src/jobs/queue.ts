import { Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import PQueue from "p-queue";
import { config } from "../config";
import { logger } from "../utils/logger";

export type DownloadJobData = {
  chatId: number;
  url: string;
  statusMessageId: number;
  prefix: string;
  mirrorVideo: boolean;
  overlayPath: string;
};

type Processor = (job: DownloadJobData) => Promise<void>;

export type DownloadQueueAdapter = {
  mode: "bullmq" | "memory";
  add: (job: DownloadJobData) => Promise<void>;
  close: () => Promise<void>;
};

export function createDownloadQueue(processor: Processor): DownloadQueueAdapter {
  if (config.redisUrl) {
    const connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });

    const queue = new Queue<DownloadJobData>("video-downloads", { connection });
    const worker = new Worker<DownloadJobData>(
      "video-downloads",
      async (job: Job<DownloadJobData>) => {
        await processor(job.data);
      },
      {
        connection,
        concurrency: config.maxConcurrent
      }
    );

    worker.on("failed", (job, error) => {
      logger.error({ error, jobId: job?.id }, "Queue job failed");
    });

    return {
      mode: "bullmq",
      async add(job) {
        await queue.add("download", job, {
          removeOnComplete: 100,
          removeOnFail: 100,
          attempts: 2,
          backoff: {
            type: "exponential",
            delay: 3000
          }
        });
      },
      async close() {
        await worker.close();
        await queue.close();
        await connection.quit();
      }
    };
  }

  const queue = new PQueue({ concurrency: config.maxConcurrent });

  return {
    mode: "memory",
    async add(job) {
      queue.add(async () => {
        try {
          await processor(job);
        } catch (error) {
          logger.error({ error }, "In-memory queue job failed");
        }
      }).catch((error) => {
        logger.error({ error }, "Failed to schedule in-memory job");
      });
    },
    async close() {
      await queue.onIdle();
      queue.clear();
    }
  };
}
