import { z } from "zod";

/**
 * Provider/model override for text inference (tagging, summarisation, chat)
 * that an admin can set at runtime from Settings → AI, stored in the DB
 * (see AIProviderConfigService in shared-server) instead of only the
 * .env-derived defaults in this package's config.ts.
 *
 * Both providers' settings are stored *simultaneously* — `openai` and
 * `ollama` are independent, both-optional blocks — and `activeProvider`
 * just picks which one is currently live. That's deliberate: it's what
 * makes switching providers a single click instead of re-entering
 * credentials and model names every time. Every field within a provider
 * block is itself optional and falls back to its .env value at merge time
 * (resolveEffectiveInferenceConfig in ../inference.ts), so an admin only
 * has to fill in what actually differs from .env.
 *
 * `activeProvider: null` (the default, and what a never-configured install
 * has) means "ignore this override entirely, behave exactly as pure .env
 * config always has" — this feature is additive-only.
 */
export const AI_PROVIDERS = ["openai", "ollama"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

const zProviderModelsSchema = z.object({
  textModel: z.string().min(1).optional(),
  imageModel: z.string().min(1).optional(),
  chatModel: z.string().min(1).optional(),
});

export const zOpenAIProviderSettingsSchema = zProviderModelsSchema.extend({
  // Not .min(1) like the rest of this file's optional strings: "" is a
  // legal value here specifically, meaning "clear the saved key" — see
  // AIProviderConfigService.set. Every other field's "" just means
  // "unset", collapsed to `undefined` client-side before it's ever sent.
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
});
export type OpenAIProviderSettings = z.infer<
  typeof zOpenAIProviderSettingsSchema
>;

export const zOllamaProviderSettingsSchema = zProviderModelsSchema.extend({
  baseUrl: z.string().url().optional(),
});
export type OllamaProviderSettings = z.infer<
  typeof zOllamaProviderSettingsSchema
>;

export const zAIProviderOverrideSchema = z.object({
  activeProvider: z.enum(AI_PROVIDERS).nullable(),
  openai: zOpenAIProviderSettingsSchema.optional(),
  ollama: zOllamaProviderSettingsSchema.optional(),
});
export type AIProviderOverride = z.infer<typeof zAIProviderOverrideSchema>;

export const DEFAULT_AI_PROVIDER_OVERRIDE: AIProviderOverride = {
  activeProvider: null,
};

/**
 * What the admin settings page actually renders: the saved override (API
 * key replaced with a redacted hint, never sent to the client in full —
 * see AIProviderConfigService.getRedacted) plus the config that's
 * *actually* in effect right now, so "no override saved" and "override
 * saved but the active provider's fields are blank, falling back to
 * .env" both show the real active provider/models instead of leaving the
 * admin guessing.
 */
export const zOpenAIProviderSettingsRedactedSchema =
  zOpenAIProviderSettingsSchema.omit({ apiKey: true }).extend({
    /** Last 4 characters of the saved key, or null if none is saved. Never
     *  the full key — this is a UI hint, not a way to recover it. */
    apiKeyHint: z.string().nullable(),
  });
export type OpenAIProviderSettingsRedacted = z.infer<
  typeof zOpenAIProviderSettingsRedactedSchema
>;

export const zAIProviderOverrideRedactedSchema = z.object({
  activeProvider: z.enum(AI_PROVIDERS).nullable(),
  openai: zOpenAIProviderSettingsRedactedSchema.optional(),
  ollama: zOllamaProviderSettingsSchema.optional(),
});
export type AIProviderOverrideRedacted = z.infer<
  typeof zAIProviderOverrideRedactedSchema
>;

export const zEffectiveInferenceConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS).nullable(),
  textModel: z.string(),
  imageModel: z.string(),
  chatModel: z.string(),
});
export type EffectiveInferenceConfigSummary = z.infer<
  typeof zEffectiveInferenceConfigSchema
>;
