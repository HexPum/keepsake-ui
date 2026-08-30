import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useTagPendingOps } from "@/lib/dense/useTagPendingOps";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";

import type { ZBookmarkTags } from "@karakeep/shared/types/tags";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { tagCaseInsensitiveKey } from "@karakeep/shared/utils/tag";

/** A chip this component actually renders, regardless of which of the two
 *  internal models (see below) produced it. */
interface DisplayedTag {
  id: string;
  name: string;
  attachedBy: "human" | "ai";
  pending: boolean;
}

export function TagsEditor({
  tags: _tags,
  onAttach,
  onDetach,
  disabled,
  allowCreation = true,
  placeholder,
}: {
  tags: ZBookmarkTags[];
  onAttach: (tag: {
    tagName: string;
    tagId?: string;
  }) => void | Promise<unknown>;
  onDetach: (tag: {
    tagName: string;
    tagId: string;
  }) => void | Promise<unknown>;
  disabled?: boolean;
  allowCreation?: boolean;
  placeholder?: string;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const demoMode = !!useClientConfig().demoMode;
  const isDisabled = demoMode || disabled;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  // --- Two independent tag-state models, selected by `allowCreation` ---
  //
  // `allowCreation === true` (the real bookmark tag editor, driven by
  // BookmarkTagsEditor's actual `bookmarks.updateTags` mutation): server
  // state (`_tags`) is the truth, and a small explicitly tracked overlay of
  // in-flight attach/detach operations sits on top of it. The whole state
  // machine — minting an op, the `isThenable` bridge to the mutation
  // promise, settling on success/error, keeping a pending attach's `×`
  // disabled — lives in `useTagPendingOps` (lib/dense/useTagPendingOps.ts),
  // extracted there so it's unit-testable without a DOM (this project's
  // convention, see that module's header comment for the full rationale
  // and why settlement is server-state-driven rather than
  // mutation-promise-driven).
  //
  // `allowCreation === false` (today, only AISettings' curated-tags list):
  // `onAttach`/`onDetach` are synchronous local-state setters, not a real
  // server mutation, and the existing behaviour there — including its own
  // latent "never re-syncs from props after the first non-empty render"
  // bug — is explicitly out of scope for this fix (see spec §2.5/§6.5).
  // Changing this branch's semantics risks a real, working settings screen
  // for a bug nobody asked to fix here, so it keeps the original
  // `optimisticTags` mechanism verbatim.
  const [legacyOptimisticTags, setLegacyOptimisticTags] =
    useState<ZBookmarkTags[]>(_tags);
  const legacyHasInitializedRef = React.useRef(_tags.length > 0);

  React.useEffect(() => {
    if (allowCreation) return;
    // When allowCreation is false, only sync on initial load. After that,
    // rely on optimistic updates to avoid re-ordering. (Preserved bug —
    // see the comment above.)
    if (!legacyHasInitializedRef.current && _tags.length > 0) {
      legacyHasInitializedRef.current = true;
      setLegacyOptimisticTags(_tags);
    }
  }, [_tags, allowCreation]);

  const {
    displayedTags: pendingOpsDisplayedTags,
    runAttach: runPendingAttach,
    runDetach: runPendingDetach,
  } = useTagPendingOps({ serverTags: _tags, onAttach, onDetach });

  const displayedTags: DisplayedTag[] = allowCreation
    ? pendingOpsDisplayedTags
    : legacyOptimisticTags.map((tag) => ({ ...tag, pending: false }));

  const runAttach = (rawName: string, existingTagId?: string) => {
    if (!allowCreation) {
      // Byte-for-byte with the pre-existing `select-option`/`create-option`
      // cases this branch replaced: dedupe by id (not name), no trimming or
      // normalisation, no case-insensitive E6/E7 guard. This branch's other
      // latent bug (never re-syncing from props after the first non-empty
      // mount — see the block comment above) is likewise left exactly as
      // found, per spec §2.5/§6.5: it is AISettings' only call site, and
      // "fixing" either here would be an unrequested change to a working
      // settings screen.
      if (existingTagId) {
        setLegacyOptimisticTags((prev) => {
          if (prev.some((tag) => tag.id === existingTagId)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: existingTagId,
              name: rawName,
              attachedBy: "human" as const,
            },
          ];
        });
      } else {
        setLegacyOptimisticTags((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}-${prev.length}`,
            name: rawName,
            attachedBy: "human" as const,
          },
        ]);
      }
      onAttach({ tagName: rawName, tagId: existingTagId });
      return;
    }

    runPendingAttach(rawName, existingTagId);
  };

  const runDetach = (target: DisplayedTag) => {
    if (target.pending) {
      // Guarded in the UI too (the remove button is disabled), but keep
      // the check here as a hard stop: a pending attach has no server tag
      // id yet, so there is nothing valid to send a detach for.
      return;
    }

    if (!allowCreation) {
      setLegacyOptimisticTags((prev) =>
        prev.filter((tag) => tag.id !== target.id),
      );
      onDetach({ tagId: target.id, tagName: target.name });
      return;
    }

    runPendingDetach(target);
  };

  // Debounce the search term before it hits the query so that fast typing
  // doesn't fire (and pile up) a separate tags.list request per keystroke.
  // Mirrors the same pattern used by TagAutocomplete/AllTagsView.
  const debouncedInputValue = useDebounce(inputValue, 300);

  const { data: filteredOptions, isLoading: isExistingTagsLoading } = useQuery(
    api.tags.list.queryOptions(
      {
        nameContains: debouncedInputValue,
        limit: 50,
        sortBy: debouncedInputValue.length > 0 ? "relevance" : "usage",
      },
      {
        select: (data) =>
          data.tags.map((t) => ({
            id: t.id,
            name: t.name,
            attachedBy:
              (t.numBookmarksByAttachedType.human ?? 0) > 0
                ? ("human" as const)
                : ("ai" as const),
          })),
        placeholderData: keepPreviousData,
        gcTime: debouncedInputValue.length > 0 ? 60_000 : 3_600_000,
      },
    ),
  );

  const selectedKeys = new Set(
    displayedTags.map((tag) => tagCaseInsensitiveKey(tag.name)),
  );

  // Add "create new" option if input doesn't match any existing option
  const trimmedInputValue = inputValue.trim();

  interface DisplayOption {
    id: string;
    name: string;
    label: string;
    attachedBy: "human" | "ai";
    isCreateOption?: boolean;
  }

  const displayedOptions = React.useMemo<DisplayOption[]>(() => {
    if (!filteredOptions) return [];

    const baseOptions = filteredOptions.map((option) => ({
      ...option,
      label: option.name,
    }));

    if (!trimmedInputValue) {
      return baseOptions;
    }

    const exactMatch = baseOptions.some(
      (opt) => opt.name.toLowerCase() === trimmedInputValue.toLowerCase(),
    );

    if (!exactMatch && allowCreation) {
      return [
        {
          id: "create-new",
          name: trimmedInputValue,
          label: `Create "${trimmedInputValue}"`,
          attachedBy: "human" as const,
          isCreateOption: true,
        },
        ...baseOptions,
      ];
    }

    return baseOptions;
  }, [filteredOptions, trimmedInputValue, allowCreation]);

  const createTag = () => {
    if (!inputValue.trim()) return;
    runAttach(inputValue.trim());
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (
      e.key === "Backspace" &&
      !inputValue &&
      displayedTags.length > 0
    ) {
      const lastTag = displayedTags[displayedTags.length - 1];
      runDetach(lastTag);
    }
  };

  const handleSelect = (option: DisplayOption) => {
    if (option.isCreateOption) {
      runAttach(option.name);
      setInputValue("");
      inputRef.current?.focus();
      return;
    }

    const existingChip = displayedTags.find(
      (tag) =>
        tagCaseInsensitiveKey(tag.name) === tagCaseInsensitiveKey(option.name),
    );

    if (existingChip) {
      runDetach(existingChip);
    } else {
      runAttach(option.name, option.id);
    }

    // Reset input and keep focus
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (open) {
      // Focus the input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const inputPlaceholder =
    placeholder ??
    (allowCreation
      ? t("tags.search_or_create_placeholder", {
          defaultValue: "Search or create tags...",
        })
      : t("tags.search_placeholder", {
          defaultValue: "Search tags...",
        }));
  const visiblePlaceholder =
    displayedTags.length === 0 ? inputPlaceholder : undefined;
  // Cap the input's rendered width in `ch` units regardless of how long the
  // typed text is. This container is the Popover's `PopoverTrigger` anchor,
  // and is `flex flex-wrap`: an uncapped width let a long enough tag name
  // grow the input wide enough to force the row to wrap onto a new line
  // while the suggestions popover was open, which fed into Radix Popover's
  // position-tracking ResizeObserver (it re-measures this anchor on every
  // resize) and crashed the page with "Maximum update depth exceeded". The
  // typed value itself is untouched here — only the visible box width is
  // capped, so nothing the user types is lost; text beyond the cap just
  // scrolls within the input like any other text field.
  const MAX_INPUT_WIDTH_CH = 24;
  const inputWidth = Math.max(
    Math.min(
      inputValue.length > 0
        ? inputValue.length
        : (visiblePlaceholder?.length ?? 1),
      MAX_INPUT_WIDTH_CH,
    ),
    1,
  );

  return (
    <div ref={containerRef} className="w-full">
      <Popover open={open && !isDisabled} onOpenChange={handleOpenChange}>
        <Command shouldFilter={false}>
          <PopoverTrigger asChild>
            <div
              className={cn(
                "border-k-border bg-k-surface-2 text-k-fg ring-offset-k-bg focus-within:ring-k-accent relative flex min-h-10 w-full flex-wrap items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] focus-within:ring-2 focus-within:ring-offset-2",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {displayedTags.length > 0 && (
                <>
                  {displayedTags.map((tag) => (
                    <div
                      key={tag.id}
                      className={cn(
                        "flex min-h-8 space-x-1 rounded-full px-2",
                        tag.attachedBy == "ai"
                          ? "bg-k-accent text-k-accent-fg"
                          : "border-k-border bg-k-surface-1 text-k-fg border",
                        tag.pending && "opacity-60",
                      )}
                    >
                      <div className="m-auto flex min-w-0 gap-2">
                        {tag.attachedBy === "ai" && (
                          <Sparkles className="m-auto size-4 shrink-0" />
                        )}
                        {/* Same rationale as inputWidth above: this pill sits
                            inside the flex-wrap Popover anchor, so an
                            unbounded-width tag name (e.g. an existing 29+
                            char tag) can force the anchor to wrap/resize
                            while the popover is open and crash the page via
                            Radix Popover's resize-driven position update.
                            Truncate the *display* only — the full name is
                            still in `tag.name`/the DB and shows via the
                            title tooltip; nothing is lost. */}
                        <span className="max-w-40 truncate" title={tag.name}>
                          {tag.name}
                        </span>
                        {!isDisabled && (
                          <button
                            type="button"
                            // A pending attach has no server tag id yet, so
                            // there is nothing valid to detach — disable
                            // rather than queue, since the attach normally
                            // settles in well under a second and a disabled
                            // `x` is simpler than a second queued-op type.
                            disabled={tag.pending}
                            aria-label={
                              tag.pending
                                ? `${tag.name} (saving…)`
                                : `Remove ${tag.name}`
                            }
                            className="rounded-full outline-none ring-offset-background focus:ring-1 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              runDetach(tag);
                            }}
                          >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove {tag.name}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
              <CommandPrimitive.Input
                ref={inputRef}
                value={inputValue}
                onKeyDown={handleKeyDown}
                onValueChange={(v) => setInputValue(v)}
                placeholder={visiblePlaceholder}
                className="text-k-fg placeholder:text-k-fg-dim bg-transparent outline-none"
                style={{ width: `${inputWidth}ch` }}
                disabled={isDisabled}
              />
              {isExistingTagsLoading && (
                <div className="absolute bottom-2 right-2">
                  <Loader2 className="text-k-fg-dim h-4 w-4 animate-spin" />
                </div>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="border-k-border bg-k-surface-1 text-k-fg w-[--radix-popover-trigger-width] p-0"
            align="start"
            onWheel={(e) => e.stopPropagation()}
          >
            <CommandList className="max-h-64">
              {displayedOptions.length === 0 ? (
                <CommandEmpty>
                  {trimmedInputValue && allowCreation ? (
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span>Create &quot;{trimmedInputValue}&quot;</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={createTag}
                        className="h-auto p-1"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    "No tags found."
                  )}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {displayedOptions.map((option) => {
                    const isSelected = selectedKeys.has(
                      tagCaseInsensitiveKey(option.name),
                    );
                    return (
                      <CommandItem
                        key={
                          option.isCreateOption
                            ? `create-${option.name}`
                            : option.id
                        }
                        value={option.label}
                        onSelect={() => handleSelect(option)}
                      >
                        <div className="flex w-full items-center gap-2">
                          {option.isCreateOption ? (
                            <Plus className="h-4 w-4" />
                          ) : (
                            <Check
                              className={cn(
                                "h-4 w-4",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                          )}
                          <span>{option.name}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </PopoverContent>
        </Command>
      </Popover>
    </div>
  );
}
