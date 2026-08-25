import { eq } from "drizzle-orm";

import type { DB, KarakeepDBTransaction } from "@karakeep/db";
import { config as configTable } from "@karakeep/db/schema";
import {
  AIProviderOverride,
  AIProviderOverrideRedacted,
  DEFAULT_AI_PROVIDER_OVERRIDE,
  zAIProviderOverrideSchema,
} from "@karakeep/shared/types/aiProviderConfig";

/**
 * Key into the generic key-value `config` table (packages/db/schema.ts) —
 * currently unused anywhere else in the codebase. Prefixed so this
 * fork-added row can never collide with any key upstream Karakeep might
 * someday store in that same table.
 */
const CONFIG_KEY = "keepsake:aiProviderOverride";

/**
 * Runtime-editable provider/model override for AI inference (summary +
 * chat), stored in the DB so `InferenceClientFactory.build()` and
 * `streamChatCompletion()` pick up a change on the very next call — both
 * already build a fresh client per job/request rather than caching one at
 * process startup, so no cache invalidation or restart is needed. See
 * packages/shared/types/aiProviderConfig.ts for the shape and the
 * "additive, .env stays the fallback" contract.
 */
export class AIProviderConfigService {
  static async get(
    db: DB | KarakeepDBTransaction,
  ): Promise<AIProviderOverride | null> {
    const row = await db.query.config.findFirst({
      where: eq(configTable.key, CONFIG_KEY),
    });
    if (!row) {
      return null;
    }
    try {
      const parsed = zAIProviderOverrideSchema.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : null;
    } catch {
      // Malformed JSON (shouldn't happen — only `set` below ever writes
      // this key) is treated the same as "never configured": fall back to
      // .env rather than failing every subsequent inference call.
      return null;
    }
  }

  /** Same as `get`, but with the OpenAI API key replaced by a display-only
   *  hint (its last 4 characters, or null) — what the settings page's
   *  query actually returns, so the full key is never sent to the client
   *  after the initial save. */
  static async getRedacted(
    db: DB | KarakeepDBTransaction,
  ): Promise<AIProviderOverrideRedacted> {
    const override = (await this.get(db)) ?? DEFAULT_AI_PROVIDER_OVERRIDE;
    const { apiKey, ...openaiRest } = override.openai ?? {};
    return {
      activeProvider: override.activeProvider,
      openai: override.openai
        ? { ...openaiRest, apiKeyHint: apiKey ? apiKey.slice(-4) : null }
        : undefined,
      ollama: override.ollama,
    };
  }

  /**
   * Upserts the override. `value.openai.apiKey: undefined` means "leave
   * whatever key is already saved alone" (the settings form only sends a
   * new key when the admin actually typed one into the masked field) —
   * pass `apiKey: ""` explicitly to clear a saved key.
   */
  static async set(
    db: DB | KarakeepDBTransaction,
    value: AIProviderOverride,
  ): Promise<void> {
    const existing = await this.get(db);
    const mergedOpenAIApiKey =
      value.openai?.apiKey === undefined
        ? existing?.openai?.apiKey
        : value.openai.apiKey || undefined;
    const merged = zAIProviderOverrideSchema.parse({
      ...value,
      openai: value.openai
        ? { ...value.openai, apiKey: mergedOpenAIApiKey }
        : mergedOpenAIApiKey
          ? { apiKey: mergedOpenAIApiKey }
          : undefined,
    });
    const serialized = JSON.stringify(merged);
    await db
      .insert(configTable)
      .values({ key: CONFIG_KEY, value: serialized })
      .onConflictDoUpdate({
        target: configTable.key,
        set: { value: serialized },
      });
  }
}
