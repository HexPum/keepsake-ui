import { Ollama } from "ollama";
import OpenAI from "openai";
import * as undici from "undici";

import serverConfig from "./config";
import { customFetch } from "./customFetch";

/**
 * A minimal, streaming-only sibling to `InferenceClient` in `./inference.ts`.
 * Deliberately kept separate rather than adding a streaming method to
 * `OpenAIInferenceClient`/`OllamaInferenceClient`: this file is new and
 * purely additive, so it can't conflict when syncing with upstream, whereas
 * `inference.ts` is actively maintained upstream for tagging/summarization.
 *
 * Provider selection mirrors `InferenceClientFactory.build()`, and the model
 * used is `serverConfig.inference.chatModel` — already-defined config
 * (`CHAT_MODEL` env var, falling back to `textModel`) with no consumers
 * before this, so no new configuration surface is introduced.
 */
export async function* streamChatCompletion(
  prompt: string,
): AsyncGenerator<string> {
  if (serverConfig.inference.openAIApiKey) {
    yield* streamFromOpenAI(prompt);
    return;
  }
  if (serverConfig.inference.ollamaBaseUrl) {
    yield* streamFromOllama(prompt);
    return;
  }
  throw new Error("No inference provider configured (OpenAI or Ollama)");
}

async function* streamFromOpenAI(prompt: string): AsyncGenerator<string> {
  const openAI = new OpenAI({
    apiKey: serverConfig.inference.openAIApiKey,
    baseURL: serverConfig.inference.openAIBaseUrl,
    timeout:
      serverConfig.inference.openAITimeoutSec !== undefined
        ? serverConfig.inference.openAITimeoutSec * 1000
        : undefined,
    defaultHeaders: {
      "X-Title": "Karakeep",
      "HTTP-Referer": "https://karakeep.app",
    },
    fetchOptions: serverConfig.inference.openAIProxyUrl
      ? {
          dispatcher: new undici.ProxyAgent(
            serverConfig.inference.openAIProxyUrl,
          ),
        }
      : undefined,
  });

  const stream = await openAI.chat.completions.create({
    model: serverConfig.inference.chatModel,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

async function* streamFromOllama(prompt: string): AsyncGenerator<string> {
  const ollama = new Ollama({
    host: serverConfig.inference.ollamaBaseUrl,
    fetch: customFetch,
  });

  const stream = await ollama.generate({
    model: serverConfig.inference.chatModel,
    prompt,
    stream: true,
    keep_alive: serverConfig.inference.ollamaKeepAlive,
    options: {
      num_ctx: serverConfig.inference.contextLength,
      num_predict: serverConfig.inference.maxOutputTokens,
    },
  });

  for await (const part of stream) {
    if (part.response) {
      yield part.response;
    }
  }
}
