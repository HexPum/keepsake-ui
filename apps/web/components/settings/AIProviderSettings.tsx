"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import type { AIProvider } from "@karakeep/shared/types/aiProviderConfig";

import { SettingsSection } from "./SettingsPage";

/** "" in a text input means "unset, fall back to .env" for every optional
 *  field here — turn that into `undefined` before it hits a Zod `.url()`/
 *  `.min(1)` check, which an empty string would fail. */
function undefinedIfBlank(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface ProviderFormState {
  baseUrl: string;
  textModel: string;
  imageModel: string;
  chatModel: string;
}

const EMPTY_PROVIDER_FORM: ProviderFormState = {
  baseUrl: "",
  textModel: "",
  imageModel: "",
  chatModel: "",
};

function ProviderFieldset({
  state,
  onChange,
  baseUrlPlaceholder,
}: {
  state: ProviderFormState;
  onChange: (next: ProviderFormState) => void;
  baseUrlPlaceholder: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field>
        <FieldLabel>Base URL</FieldLabel>
        <Input
          value={state.baseUrl}
          onChange={(e) => onChange({ ...state, baseUrl: e.target.value })}
          placeholder={baseUrlPlaceholder}
        />
      </Field>
      <Field>
        <FieldLabel>Chat model</FieldLabel>
        <Input
          value={state.chatModel}
          onChange={(e) => onChange({ ...state, chatModel: e.target.value })}
          placeholder="Falls back to text model"
        />
      </Field>
      <Field>
        <FieldLabel>Text model</FieldLabel>
        <Input
          value={state.textModel}
          onChange={(e) => onChange({ ...state, textModel: e.target.value })}
          placeholder="Falls back to .env default"
        />
      </Field>
      <Field>
        <FieldLabel>Image model</FieldLabel>
        <Input
          value={state.imageModel}
          onChange={(e) => onChange({ ...state, imageModel: e.target.value })}
          placeholder="Falls back to .env default"
        />
      </Field>
    </div>
  );
}

/**
 * Admin-only (page.tsx gates rendering on session.user.role): lets an admin
 * save credentials for both OpenAI-compatible and Ollama ahead of time,
 * then switch which one is live with the radio group below — no need to
 * re-enter anything to switch back and forth. See
 * packages/shared/types/aiProviderConfig.ts for the "both saved, one
 * active" shape this is editing, and inference.ts's
 * InferenceClientFactory.build for why the switch takes effect on the
 * very next inference job rather than needing a restart.
 */
export function AIProviderSettings() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    api.admin.getAIProviderConfig.queryOptions(),
  );

  const [activeProvider, setActiveProvider] = useState<AIProvider | null>(null);
  const [openai, setOpenai] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [ollama, setOllama] = useState<ProviderFormState>(EMPTY_PROVIDER_FORM);

  // Sync form state from the fetched row once (and again if it changes from
  // elsewhere) — same "don't stomp an in-progress edit" concern
  // EditBookmarkDialog's useDialogFormReset addresses, simplified here
  // since this form has no open/close lifecycle to key off; a plain
  // once-per-fetch sync is enough for a settings page nobody else is
  // editing concurrently.
  useEffect(() => {
    if (!data) return;
    setActiveProvider(data.override.activeProvider);
    setOpenai({
      baseUrl: data.override.openai?.baseUrl ?? "",
      textModel: data.override.openai?.textModel ?? "",
      imageModel: data.override.openai?.imageModel ?? "",
      chatModel: data.override.openai?.chatModel ?? "",
    });
    setOllama({
      baseUrl: data.override.ollama?.baseUrl ?? "",
      textModel: data.override.ollama?.textModel ?? "",
      imageModel: data.override.ollama?.imageModel ?? "",
      chatModel: data.override.ollama?.chatModel ?? "",
    });
    // The API key field intentionally stays blank on every sync — see
    // openaiApiKeyPlaceholder below for how the saved key is hinted at
    // instead.
  }, [data]);

  const { mutate: save, isPending } = useMutation(
    api.admin.setAIProviderConfig.mutationOptions({
      onSuccess: () => {
        toast({ description: "AI provider settings saved!" });
        setOpenaiApiKey("");
        queryClient.invalidateQueries(
          api.admin.getAIProviderConfig.pathFilter(),
        );
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: "Failed to save AI provider settings",
          description: e.message,
        });
      },
    }),
  );

  const onSave = () => {
    save({
      activeProvider,
      openai: {
        apiKey: undefinedIfBlank(openaiApiKey),
        baseUrl: undefinedIfBlank(openai.baseUrl),
        textModel: undefinedIfBlank(openai.textModel),
        imageModel: undefinedIfBlank(openai.imageModel),
        chatModel: undefinedIfBlank(openai.chatModel),
      },
      ollama: {
        baseUrl: undefinedIfBlank(ollama.baseUrl),
        textModel: undefinedIfBlank(ollama.textModel),
        imageModel: undefinedIfBlank(ollama.imageModel),
        chatModel: undefinedIfBlank(ollama.chatModel),
      },
    });
  };

  const openaiApiKeyPlaceholder = data?.override.openai?.apiKeyHint
    ? `Saved, ends in ${data.override.openai.apiKeyHint} — leave blank to keep it`
    : "sk-...";

  return (
    <SettingsSection
      title="AI provider override"
      description="Configure both providers ahead of time, then switch which one is live below — takes effect on the next summary/tag/chat request, no restart needed. Leave everything blank to keep using the server's .env configuration."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <FieldGroup className="gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            <span className="text-muted-foreground">Currently active:</span>
            {data?.effective.provider ? (
              <>
                <Badge variant="secondary">{data.effective.provider}</Badge>
                <span className="text-muted-foreground">
                  text: <code>{data.effective.textModel}</code> · chat:{" "}
                  <code>{data.effective.chatModel}</code>
                </span>
              </>
            ) : (
              <Badge variant="destructive">not configured</Badge>
            )}
          </div>

          <Field>
            <FieldContent>
              <FieldTitle>Active provider</FieldTitle>
              <FieldDescription>
                Which saved configuration below is actually used.
              </FieldDescription>
            </FieldContent>
            <RadioGroup
              value={activeProvider ?? "env"}
              onValueChange={(value) =>
                setActiveProvider(
                  value === "env" ? null : (value as AIProvider),
                )
              }
              className="grid gap-2 sm:grid-cols-3"
            >
              {(
                [
                  { value: "env", label: "Server .env default" },
                  { value: "openai", label: "OpenAI-compatible" },
                  { value: "ollama", label: "Ollama" },
                ] as const
              ).map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`ai-provider-${option.value}`}
                  className="flex items-center gap-2 rounded-md border p-2.5 font-normal"
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`ai-provider-${option.value}`}
                  />
                  {option.label}
                </Label>
              ))}
            </RadioGroup>
          </Field>

          <FieldSeparator />

          <Field>
            <FieldContent>
              <FieldTitle>OpenAI-compatible</FieldTitle>
              <FieldDescription>
                Also used for any self-hosted server exposing an
                OpenAI-compatible API (LM Studio, vLLM, ...) via Base URL.
              </FieldDescription>
            </FieldContent>
            <div className="grid w-full gap-3">
              <Field>
                <FieldLabel>API key</FieldLabel>
                <Input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder={openaiApiKeyPlaceholder}
                  autoComplete="off"
                />
              </Field>
              <ProviderFieldset
                state={openai}
                onChange={setOpenai}
                baseUrlPlaceholder="https://api.openai.com/v1"
              />
            </div>
          </Field>

          <FieldSeparator />

          <Field>
            <FieldContent>
              <FieldTitle>Ollama</FieldTitle>
              <FieldDescription>No API key needed.</FieldDescription>
            </FieldContent>
            <div className="grid w-full gap-3">
              <ProviderFieldset
                state={ollama}
                onChange={setOllama}
                baseUrlPlaceholder="http://localhost:11434"
              />
            </div>
          </Field>

          <div className="flex justify-end pt-2">
            <Button onClick={onSave} disabled={isPending}>
              <Save className="mr-2 size-4" />
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </FieldGroup>
      )}
    </SettingsSection>
  );
}
