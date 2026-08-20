"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import CopyBtn from "@/components/ui/copy-button";
import { MarkdownReadonly } from "@/components/ui/markdown/markdown-readonly";
import { Textarea } from "@/components/ui/textarea";
import { useClientConfig } from "@/lib/clientConfig";
import { cn } from "@/lib/utils";
import { RotateCcw, SendHorizontal, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SECTION_LABEL =
  "font-k-mono text-k-fg-dim text-[10px] font-medium uppercase tracking-[0.08em]";

/**
 * The sidebar's collapsed-rail bookmark glyph (DenseSidebar.tsx), reused
 * here only for the empty state's big centered mark. Inlined rather than
 * shared: it's a 6-line decorative glyph used in exactly two places.
 */
function KeepsakeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 3h16v18l-8-5-8 5V3Z"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Three-dot "generating" indicator — opacity-only pulse, per the design
 *  system's motion rule (no transform/shadow transitions). */
function TypingDots() {
  return (
    <div className="flex items-center gap-[4px] py-[2px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-k-fg-dim size-[5px] animate-pulse rounded-full"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Minimal, one-shot chat over the user's saved bookmarks: no conversation
 * persistence (messages live only in this component's state — see the
 * plan this was built from for why `chatSessions`/`chatMessages` were left
 * alone), backed by a streaming `/api/chat` endpoint.
 */
export default function DenseChat() {
  const clientConfig = useClientConfig();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatAvailable =
    clientConfig.chat.enabled && clientConfig.inference.isConfigured;

  async function sendMessage() {
    const question = input.trim();
    if (!question || isStreaming) {
      return;
    }
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Something went wrong");
      }

      // Manual SSE parsing rather than `EventSource`, since this is a POST
      // request and `EventSource` only supports GET.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const data = event.replace(/^data: /, "").trim();
          if (!data || data === "[DONE]") {
            continue;
          }
          const parsed = JSON.parse(data) as { delta?: string; error?: string };
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.delta) {
            appendToLastAssistantMessage(setMessages, parsed.delta);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setIsStreaming(false);
    }
  }

  if (!chatAvailable) {
    // No `h-full` here: this renders directly under `dashboard/layout.tsx`'s
    // `<main>`, whose own content wrapper (`min-h-30 p-4 pb-20 sm:pb-4`) has
    // no `flex-1`/`h-full` of its own, so a percentage height on a
    // descendant collapses to its content size instead of the viewport —
    // fixed padding stands in for true vertical centering here rather than
    // fighting that (shared, upstream-owned) wrapper's height chain.
    return (
      <div className="text-k-fg-dim flex flex-col items-center gap-[10px] px-[22px] py-[100px] text-center text-[13px] leading-[1.6]">
        <Sparkles size={20} strokeWidth={1.75} />
        <p>
          Chat needs to be enabled and an AI provider configured on the server —
          set{" "}
          <code className="font-k-mono text-k-fg-muted">CHAT_ENABLED=true</code>{" "}
          and either{" "}
          <code className="font-k-mono text-k-fg-muted">OPENAI_API_KEY</code> or{" "}
          <code className="font-k-mono text-k-fg-muted">OLLAMA_BASE_URL</code>.
        </p>
      </div>
    );
  }

  // Same reasoning as the gated state above: no bounded height is available
  // here, so rather than a `flex-1 overflow-y-auto` message pane with a
  // `flex-none` input bar competing for a fixed budget, `<main>` is left as
  // the actual scroller (exactly how DenseBookmarkDetail's full-page route
  // works) and the input bar sticks to the viewport bottom via
  // `position: sticky` instead of flex layout.
  return (
    <div className="bg-k-bg flex flex-col">
      <div className="border-k-border bg-k-bg sticky top-0 z-10 flex items-center justify-between border-b px-[22px] py-[13px]">
        <p className={SECTION_LABEL}>Chat</p>
        {messages.length > 0 && (
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="font-k-mono text-k-fg-dim hover:text-k-fg-muted inline-flex items-center gap-[6px] text-[10.5px] font-medium uppercase tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={12} strokeWidth={1.75} />
            New chat
          </button>
        )}
      </div>

      <div className="px-[22px] py-[18px]">
        {messages.length === 0 ? (
          <div className="text-k-fg-dim flex flex-col items-center gap-[6px] py-[100px] text-center text-[13px]">
            <KeepsakeMark className="text-k-fg-dim size-[20px]" />
            <p>Ask about anything you&apos;ve saved to Keepsake.</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[640px] flex-col">
            {messages.map((message, i) => (
              <ChatTurn
                key={i}
                message={message}
                // Only the very last message can still be streaming — every
                // earlier one is already resolved, so it's safe to show
                // its copy action.
                isStreaming={isStreaming && i === messages.length - 1}
              />
            ))}
            {error && (
              <p className="text-k-fg-dim border-k-border-soft border-t py-[14px] text-[12px]">
                Error: {error}
              </p>
            )}
            <div ref={listEndRef} />
          </div>
        )}
      </div>

      <div className="border-k-border bg-k-bg sticky bottom-0 z-10 border-t px-[22px] py-[14px]">
        <div className="mx-auto flex max-w-[640px] items-end gap-[10px]">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask about your saved bookmarks…"
            rows={1}
            className="border-k-border bg-k-surface-1 text-k-fg placeholder:text-k-fg-dim min-h-[38px] flex-1 resize-none rounded-[10px] text-[13px] leading-[1.5]"
          />
          <ActionButton
            variant="none"
            size="none"
            loading={isStreaming}
            disabled={!input.trim()}
            onClick={sendMessage}
            aria-label="Send"
            className="font-k-mono border-k-accent-border text-k-accent flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] border disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SendHorizontal size={16} strokeWidth={1.75} />
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function appendToLastAssistantMessage(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  delta: string,
) {
  setMessages((prev) => {
    const next = [...prev];
    const last = next[next.length - 1];
    next[next.length - 1] = { ...last, content: last.content + delta };
    return next;
  });
}

/**
 * One turn of the conversation, styled like every other repeating,
 * labelled block in the dense fork (bookmark list rows, the sections in
 * DenseBookmarkDetail): a `border-k-border-soft` top divider plus a mono
 * uppercase label, no bubble or avatar — Keepsake doesn't have that idiom
 * anywhere else, so a chat message shouldn't invent one. Only alignment
 * (right for the user, left for the reply) distinguishes the two roles,
 * the same left/right convention the UI kit this was adapted from uses.
 */
function ChatTurn({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "border-k-border-soft flex flex-col gap-[6px] border-t py-[14px] first:border-t-0",
        isUser && "items-end",
      )}
    >
      <p className={SECTION_LABEL}>{isUser ? "You" : "Keepsake"}</p>
      {isUser ? (
        <p className="text-k-fg max-w-[85%] text-right text-[13px] leading-[1.5]">
          {message.content}
        </p>
      ) : message.content ? (
        <>
          <MarkdownReadonly className="text-k-fg-muted text-[13px] leading-[1.55]">
            {message.content}
          </MarkdownReadonly>
          {!isStreaming && (
            <CopyBtn
              className="text-k-fg-dim hover:text-k-fg-muted self-start [&>svg]:size-[13px]"
              getStringToCopy={() => message.content}
            />
          )}
        </>
      ) : isStreaming ? (
        <TypingDots />
      ) : null}
    </div>
  );
}
