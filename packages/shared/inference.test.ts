import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import serverConfig from "./config";
import {
  OpenAIInferenceClient,
  resolveEffectiveInferenceConfig,
} from "./inference";
import type { OpenAIInferenceConfig } from "./inference";

const capturedBodies: Record<string, unknown>[] = [];
const tagSchema = z.object({ tags: z.array(z.string()) });

vi.mock("openai", () => {
  const OpenAIMock = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(async (body: Record<string, unknown>) => {
          capturedBodies.push(body);
          return {
            choices: [{ message: { content: "{}" } }],
            usage: { total_tokens: 1 },
          };
        }),
      },
    },
  }));

  return { default: OpenAIMock };
});

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: (schema: unknown, name: string) => ({
    type: "json_schema",
    json_schema: { name, schema },
  }),
}));

function makeConfig(
  outputSchema: OpenAIInferenceConfig["outputSchema"],
): OpenAIInferenceConfig {
  return {
    apiKey: "test-key",
    textModel: "test-text-model",
    imageModel: "test-image-model",
    contextLength: 2048,
    maxOutputTokens: 1024,
    useMaxCompletionTokens: false,
    outputSchema,
  };
}

describe("OpenAIInferenceClient response_format", () => {
  beforeEach(() => {
    capturedBodies.length = 0;
  });

  it("omits response_format for schema-less text inference in json mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));

    await client.inferFromText("summarize this text", { schema: null });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toBeUndefined();
  });

  it("keeps json_object for schema-backed text inference in json mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));

    await client.inferFromText("infer tags as json", { schema: tagSchema });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toEqual({ type: "json_object" });
  });

  it("omits response_format for schema-less image inference in json mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));

    await client.inferFromImage("describe this image", "image/png", "BASE64", {
      schema: null,
    });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toBeUndefined();
  });

  it("keeps structured response_format for schema-backed text inference in structured mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("structured"));

    await client.inferFromText("infer tags", { schema: tagSchema });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "schema" },
    });
  });
});

describe("resolveEffectiveInferenceConfig", () => {
  it("returns the .env-derived defaults when no override is given", () => {
    expect(resolveEffectiveInferenceConfig(null)).toEqual({
      openAIApiKey: serverConfig.inference.openAIApiKey,
      openAIBaseUrl: serverConfig.inference.openAIBaseUrl,
      ollamaBaseUrl: serverConfig.inference.ollamaBaseUrl,
      textModel: serverConfig.inference.textModel,
      imageModel: serverConfig.inference.imageModel,
      chatModel: serverConfig.inference.chatModel,
    });
    expect(resolveEffectiveInferenceConfig(undefined)).toEqual(
      resolveEffectiveInferenceConfig(null),
    );
  });

  it("returns the .env-derived defaults when activeProvider is null, ignoring any stray fields", () => {
    const effective = resolveEffectiveInferenceConfig({
      activeProvider: null,
      openai: { apiKey: "should-be-ignored" },
    });
    expect(effective).toEqual(resolveEffectiveInferenceConfig(null));
  });

  it("uses every openai override field, forcing ollamaBaseUrl unset, when active", () => {
    const effective = resolveEffectiveInferenceConfig({
      activeProvider: "openai",
      openai: {
        apiKey: "override-key",
        baseUrl: "https://override.example/v1",
        textModel: "override-text",
        imageModel: "override-image",
        chatModel: "override-chat",
      },
    });
    expect(effective).toEqual({
      openAIApiKey: "override-key",
      openAIBaseUrl: "https://override.example/v1",
      ollamaBaseUrl: undefined,
      textModel: "override-text",
      imageModel: "override-image",
      chatModel: "override-chat",
    });
  });

  it("falls back to .env for any openai field the override leaves unset", () => {
    const effective = resolveEffectiveInferenceConfig({
      activeProvider: "openai",
      openai: { apiKey: "override-key" },
    });
    expect(effective.openAIApiKey).toBe("override-key");
    expect(effective.openAIBaseUrl).toBe(serverConfig.inference.openAIBaseUrl);
    expect(effective.textModel).toBe(serverConfig.inference.textModel);
    expect(effective.imageModel).toBe(serverConfig.inference.imageModel);
    expect(effective.chatModel).toBe(serverConfig.inference.chatModel);
  });

  it("uses every ollama override field, forcing openAIApiKey unset, when active", () => {
    const effective = resolveEffectiveInferenceConfig({
      activeProvider: "ollama",
      ollama: {
        baseUrl: "http://localhost:11434",
        textModel: "llama3",
        imageModel: "llava",
        chatModel: "llama3-chat",
      },
    });
    expect(effective).toEqual({
      openAIApiKey: undefined,
      openAIBaseUrl: serverConfig.inference.openAIBaseUrl,
      ollamaBaseUrl: "http://localhost:11434",
      textModel: "llama3",
      imageModel: "llava",
      chatModel: "llama3-chat",
    });
  });

  it("forces the chosen provider even if the other provider's .env var is also set — explicit choice wins over auto-detection", () => {
    const effective = resolveEffectiveInferenceConfig({
      activeProvider: "ollama",
      ollama: { baseUrl: "http://localhost:11434" },
    });
    expect(effective.openAIApiKey).toBeUndefined();
    expect(effective.ollamaBaseUrl).toBe("http://localhost:11434");
  });
});
