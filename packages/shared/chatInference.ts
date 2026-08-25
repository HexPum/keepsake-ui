import { Ollama } from "ollama";
import OpenAI from "openai";
import * as undici from "undici";

import serverConfig from "./config";
import { customFetch } from "./customFetch";
import {
  EffectiveInferenceConfig,
  resolveEffectiveInferenceConfig,
} from "./inference";
import { AIProviderOverride } from "./types/aiProviderConfig";

/**
 * A minimal, streaming-only sibling to `InferenceClient` in `./inference.ts`.
 * Deliberately kept separate rather than adding a streaming method to
 * `OpenAIInferenceClient`/`OllamaInferenceClient`: this file is new and
 * purely additive, so it can't conflict when syncing with upstream, whereas
 * `inference.ts` is actively maintained upstream for tagging/summarization.
 *
 * Provider/model selection goes through the same
 * resolveEffectiveInferenceConfig merge InferenceClientFactory.build uses —
 * `override` is the DB-saved AIProviderOverride, if any; omitting it is
 * identical to passing `null` (pure .env behaviour, as before this feature
 * existed).
 */
export async function* streamChatCompletion(
  prompt: string,
  override?: AIProviderOverride | null,
): AsyncGenerator<string> {
  const effective = resolveEffectiveInferenceConfig(override);
  if (effective.openAIApiKey) {
    yield* streamFromOpenAI(prompt, effective);
    return;
  }
  if (effective.ollamaBaseUrl) {
    yield* streamFromOllama(prompt, effective);
    return;
  }
  throw new Error("No inference provider configured (OpenAI or Ollama)");
}

async function* streamFromOpenAI(
  prompt: string,
  effective: EffectiveInferenceConfig,
): AsyncGenerator<string> {
  const openAI = new OpenAI({
    apiKey: effective.openAIApiKey,
    baseURL: effective.openAIBaseUrl,
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
    model: effective.chatModel,
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

async function* streamFromOllama(
  prompt: string,
  effective: EffectiveInferenceConfig,
): AsyncGenerator<string> {
  const ollama = new Ollama({
    host: effective.ollamaBaseUrl,
    fetch: customFetch,
  });

  const stream = await ollama.generate({
    model: effective.chatModel,
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
