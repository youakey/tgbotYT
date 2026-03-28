import { IncomingMessage, Server, ServerResponse, createServer } from "node:http";
import { Telegraf } from "telegraf";
import { createBot } from "./bot";
import { createDownloadQueue } from "./jobs/queue";
import { DownloadJobData } from "./jobs/queue";
import { config } from "./config";
import { downloadVideoFile } from "./services/downloadService";
import { processVideo } from "./services/videoProcessingService";
import { cleanupFilesByPrefix, ensureTempDir } from "./services/tempFileService";
import { sendAsVideo } from "./services/telegramSendService";
import { userMessageForError } from "./utils/errors";
import { logger } from "./utils/logger";

async function updateStatus(bot: Telegraf, chatId: number, messageId: number, text: string): Promise<void> {
  try {
    await bot.telegram.editMessageText(chatId, messageId, undefined, text);
  } catch {
    // Ignore message update failures.
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function isDownloadJobData(value: unknown): value is DownloadJobData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeJob = value as Partial<DownloadJobData>;

  return (
    Number.isInteger(maybeJob.chatId) &&
    Number.isInteger(maybeJob.statusMessageId) &&
    typeof maybeJob.url === "string" &&
    maybeJob.url.length > 0 &&
    typeof maybeJob.prefix === "string" &&
    maybeJob.prefix.length > 0 &&
    typeof maybeJob.mirrorVideo === "boolean" &&
    typeof maybeJob.overlayPath === "string" &&
    maybeJob.overlayPath.length > 0
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bufferChunk.length;

    if (size > 64 * 1024) {
      throw new Error("Request body too large");
    }

    chunks.push(bufferChunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) {
    return {};
  }

  return JSON.parse(text) as unknown;
}

function extractApiKey(req: IncomingMessage): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const xApiKey = req.headers["x-api-key"];
  return typeof xApiKey === "string" ? xApiKey.trim() : "";
}

async function startQueueApiServer(queue: ReturnType<typeof createDownloadQueue>): Promise<Server> {
  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");

    if (method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/api/queue/add") {
      if (config.backendApiKey) {
        const providedKey = extractApiKey(req);
        if (providedKey !== config.backendApiKey) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
      }

      try {
        const payload = await readJsonBody(req);
        if (!isDownloadJobData(payload)) {
          sendJson(res, 400, { error: "Invalid job payload" });
          return;
        }

        await queue.add(payload);
        sendJson(res, 202, { accepted: true });
      } catch (error) {
        logger.warn({ error }, "Failed to accept queue job");
        sendJson(res, 400, { error: "Invalid request body" });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => resolve());
  });

  logger.info({ port: config.port }, "Backend queue API is listening");
  return server;
}

async function bootstrap(): Promise<void> {
  await ensureTempDir();

  let botRef: Telegraf;
  const queue = createDownloadQueue(async (job) => {
    await updateStatus(botRef, job.chatId, job.statusMessageId, "Processing...");

    try {
      const downloaded = await downloadVideoFile(job.url, job.prefix);
      const processed = await processVideo(downloaded.filePath, job.prefix, {
        mirrorVideo: job.mirrorVideo,
        overlayPath: job.overlayPath
      });

      await sendAsVideo(botRef, job.chatId, processed.outputPath, processed.fileName);
      await updateStatus(botRef, job.chatId, job.statusMessageId, "Done");
    } catch (error) {
      logger.warn({ error, url: job.url, chatId: job.chatId }, "Failed to process job");
      await updateStatus(botRef, job.chatId, job.statusMessageId, userMessageForError(error));
    } finally {
      await cleanupFilesByPrefix(job.prefix);
    }
  });

  const bot = config.enablePolling ? createBot(queue) : new Telegraf(config.botToken);
  botRef = bot;

  const apiServer = await startQueueApiServer(queue);

  if (config.enablePolling) {
    try {
      await bot.telegram.setMyCommands([
        { command: "start", description: "Quick start and usage" },
        { command: "help", description: "Show command list" },
        { command: "settings", description: "Open processing settings" },
        { command: "options", description: "Alias for settings" }
      ]);
    } catch (error) {
      logger.warn({ error }, "Failed to register bot commands");
    }

    await bot.launch();
    logger.info({ queueMode: queue.mode }, "Bot polling is running");
  } else {
    logger.info({ queueMode: queue.mode }, "Polling is disabled; running as queue backend only");
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    await new Promise<void>((resolve, reject) => {
      apiServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    if (config.enablePolling) {
      bot.stop(signal);
    }
    await queue.close();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.error({ error }, "Uncaught exception");
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, "Startup failed");
  process.exit(1);
});
