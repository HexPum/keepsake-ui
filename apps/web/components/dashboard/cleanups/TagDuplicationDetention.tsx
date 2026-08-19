"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { distance } from "fastest-levenshtein";
import { Check, ChevronDown, Combine, X } from "lucide-react";

import { useMergeTag } from "@karakeep/shared-react/hooks/tags";
import { useTRPC } from "@karakeep/shared-react/trpc";

interface Suggestion {
  mergeIntoId: string;
  tags: { id: string; name: string }[];
}

function normalizeTag(tag: string) {
  return tag.toLocaleLowerCase().replace(/[ -_]/g, "");
}

const useSuggestions = () => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  function updateMergeInto(suggestion: Suggestion, newMergeIntoId: string) {
    setSuggestions((prev) =>
      prev.map((s) =>
        s === suggestion ? { ...s, mergeIntoId: newMergeIntoId } : s,
      ),
    );
  }

  function deleteSuggestion(suggestion: Suggestion) {
    setSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }

  return { suggestions, updateMergeInto, deleteSuggestion, setSuggestions };
};

/**
 * Kept as a plain shadcn dialog (unstyled for dense) rather than restyled —
 * confirmation modals are a separate, app-wide concern shared by other
 * destructive actions, not part of this screen's list/row language.
 */
function ApplyAllButton({ suggestions }: { suggestions: Suggestion[] }) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  const { mutateAsync } = useMergeTag({
    onError: (e) => {
      toast({
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const applyAll = async (setDialogOpen: (open: boolean) => void) => {
    const promises = suggestions.map((suggestion) =>
      mutateAsync({
        intoTagId: suggestion.mergeIntoId,
        fromTagIds: suggestion.tags
          .filter((t) => t.id != suggestion.mergeIntoId)
          .map((t) => t.id),
      }),
    );
    setApplying(true);
    await Promise.all(promises)
      .then(() => {
        toast({
          description: "All suggestions has been applied!",
        });
      })
      .catch(() => ({}))
      .finally(() => {
        setApplying(false);
        setDialogOpen(false);
      });
  };

  return (
    <ActionConfirmingDialog
      title={t("cleanups.duplicate_tags.merge_all_suggestions")}
      description={`Are you sure you want to apply all ${suggestions.length} suggestions?`}
      actionButton={(setDialogOpen) => (
        <ActionButton
          loading={applying}
          variant="destructive"
          onClick={() => applyAll(setDialogOpen)}
        >
          <Check className="mr-2 size-4" />
          {t("actions.apply_all")}
        </ActionButton>
      )}
    >
      <button
        type="button"
        className="border-k-border bg-k-surface-1 text-k-fg-muted hover:text-k-fg flex h-[28px] flex-none items-center gap-[8px] rounded-[8px] border px-[12px] text-[12.5px]"
      >
        <Check size={15} strokeWidth={1.75} />
        {t("actions.apply_all")}
      </button>
    </ActionConfirmingDialog>
  );
}

/**
 * One suggestion group. Deliberately not the shadcn `Table` the original
 * used — a bordered/striped table is exactly the generic-admin-panel look
 * the design research flags, and every other dense list in this fork is a
 * flat row separated by `border-t` (DenseHighlightRow, DenseBookmarkRow),
 * so this follows that instead of inventing a second row language.
 */
function SuggestionRow({
  suggestion,
  updateMergeInto,
  deleteSuggestion,
}: {
  suggestion: Suggestion;
  updateMergeInto: (suggestion: Suggestion, newMergeIntoId: string) => void;
  deleteSuggestion: (suggestion: Suggestion) => void;
}) {
  const { t } = useTranslation();
  const { mutate, isPending } = useMergeTag({
    onSuccess: () => {
      toast({
        description: "Tags have been merged!",
      });
    },
    onError: (e) => {
      toast({
        description: e.message,
        variant: "destructive",
      });
    },
  });
  return (
    <div className="border-k-border-soft flex flex-wrap items-center gap-[12px] border-t px-[18px] py-[12px]">
      <div className="flex min-w-0 flex-1 flex-wrap gap-[6px]">
        {suggestion.tags.map((tag) => {
          const selected = suggestion.mergeIntoId == tag.id;
          return (
            <div key={tag.id} className="group relative">
              <Link
                href={`/dashboard/tags/${tag.id}`}
                className={cn(
                  "rounded-[6px] border px-[9px] py-[4px] text-[11.5px]",
                  selected
                    ? "border-k-accent-border text-k-fg bg-k-border-soft"
                    : "border-k-border text-k-fg-muted hover:text-k-fg-soft",
                )}
              >
                {tag.name}
              </Link>
              {!selected && (
                <button
                  type="button"
                  aria-label={`Keep ${tag.name}`}
                  onClick={() => updateMergeInto(suggestion, tag.id)}
                  className="bg-k-accent text-k-accent-fg absolute -right-1.5 -top-1.5 hidden size-[15px] items-center justify-center rounded-full group-hover:flex"
                >
                  <Check size={9} strokeWidth={2.5} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-none items-center gap-[6px]">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            mutate({
              intoTagId: suggestion.mergeIntoId,
              fromTagIds: suggestion.tags
                .filter((t) => t.id != suggestion.mergeIntoId)
                .map((t) => t.id),
            })
          }
          className={cn(
            "border-k-border bg-k-surface-1 text-k-fg-muted hover:text-k-fg flex h-[26px] items-center gap-[6px] rounded-[7px] border px-[10px] text-[11.5px]",
            isPending && "opacity-50",
          )}
        >
          <Combine size={13} strokeWidth={1.75} />
          {isPending ? "Merging…" : t("actions.merge")}
        </button>
        <button
          type="button"
          onClick={() => deleteSuggestion(suggestion)}
          aria-label={t("actions.ignore")}
          className="text-k-fg-dim hover:text-k-fg-muted flex h-[26px] items-center justify-center rounded-[7px] px-[6px]"
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

export function TagDuplicationDetection() {
  const { t } = useTranslation();
  const api = useTRPC();
  const [expanded, setExpanded] = useState(false);
  let { data: allTags } = useQuery(
    api.tags.list.queryOptions(
      {},
      {
        refetchOnWindowFocus: false,
      },
    ),
  );

  const { suggestions, updateMergeInto, setSuggestions, deleteSuggestion } =
    useSuggestions();

  useEffect(() => {
    allTags = allTags ?? { tags: [], nextCursor: null };
    const sortedTags = allTags.tags.sort((a, b) =>
      normalizeTag(a.name).localeCompare(normalizeTag(b.name)),
    );

    const initialSuggestions: Suggestion[] = [];
    for (let i = 0; i < sortedTags.length; i++) {
      const currentName = normalizeTag(sortedTags[i].name);
      const suggestion = [sortedTags[i]];
      for (let j = i + 1; j < sortedTags.length; j++) {
        const nextName = normalizeTag(sortedTags[j].name);
        if (distance(currentName, nextName) <= 1) {
          suggestion.push(sortedTags[j]);
        } else {
          break;
        }
      }
      if (suggestion.length > 1) {
        initialSuggestions.push({
          mergeIntoId: suggestion[0].id,
          tags: suggestion,
        });
        i += suggestion.length - 1;
      }
    }
    setSuggestions(initialSuggestions);
  }, [allTags]);

  if (!allTags) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    // Same shell as AllHighlights/DenseFilesView: cancels the dashboard
    // shell's p-4, caps width, header row owns the section label + meta
    // line + right-aligned controls. One Collapsible root spans the trigger
    // (in the header) and the content (below) — they don't need to be
    // adjacent, just both descendants of the same root.
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="-m-4 flex flex-col"
    >
      <div className="flex w-full max-w-[1400px] flex-col">
        <div className="flex items-center gap-[14px] px-[22px] pb-[12px] pt-[15px]">
          <div className="flex flex-col gap-[3px]">
            <h1 className="text-k-section-label text-[15px] font-semibold uppercase tracking-[0.06em]">
              {t("cleanups.cleanups")}
            </h1>
            <p className="font-k-mono text-k-fg-dim text-[11.5px]">
              {t("cleanups.duplicate_tags.title")} · {suggestions.length}{" "}
              suggestion{suggestions.length === 1 ? "" : "s"}
            </p>
          </div>

          {suggestions.length > 0 && (
            <div className="ml-auto flex items-center gap-[10px]">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="font-k-mono text-k-fg-dim hover:text-k-fg-muted flex items-center gap-[4px] text-[11px] uppercase tracking-[0.06em]"
                >
                  {expanded ? "Hide all" : "Show all"}
                  <ChevronDown
                    size={12}
                    className={cn(
                      "transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
              <ApplyAllButton suggestions={suggestions} />
            </div>
          )}
        </div>

        {suggestions.length === 0 ? (
          <p className="text-k-fg-dim px-[22px] py-[14px] text-[12.5px]">
            No duplicate tags found.
          </p>
        ) : (
          <CollapsibleContent>
            <p className="text-k-fg-dim px-[22px] pb-[10px] text-[12px]">
              For every suggestion, pick the tag to keep — the rest merge into
              it.
            </p>
            <div className="flex flex-col">
              {suggestions.map((suggestion) => (
                <SuggestionRow
                  key={suggestion.mergeIntoId}
                  suggestion={suggestion}
                  updateMergeInto={updateMergeInto}
                  deleteSuggestion={deleteSuggestion}
                />
              ))}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}
