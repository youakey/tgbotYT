import { createReadStream } from "node:fs";
import { Telegraf } from "telegraf";

export async function sendAsDocument(
  bot: Telegraf,
  chatId: number,
  filePath: string,
  fileName: string
): Promise<void> {
  await bot.telegram.sendDocument(
    chatId,
    {
      source: createReadStream(filePath),
      filename: fileName
    },
    {
      disable_content_type_detection: true
    }
  );
}

export async function sendAsVideo(
  bot: Telegraf,
  chatId: number,
  filePath: string,
  fileName: string
): Promise<void> {
  await bot.telegram.sendVideo(
    chatId,
    {
      source: createReadStream(filePath),
      filename: fileName
    },
    {
      supports_streaming: true
    }
  );
}
