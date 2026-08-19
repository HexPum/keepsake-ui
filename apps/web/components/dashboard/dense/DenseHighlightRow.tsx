"use client";

import Link from "next/link";
import { toast } from "@/components/ui/sonner";
import { formatCompactRelativeTime } from "@/lib/dense/format";
import { useRowNavigate } from "@/lib/dense/useRowNavigate";
import { Trash2 } from "lucide-react";

import { useDeleteHighlight } from "@karakeep/shared-react/hooks/highlights";
import { ZHighlight, ZHighlightColor } from "@karakeep/shared/types/highlights";

/**
 * Dot colours for highlight categories, in the same spirit as the sidebar's
 * list dots (design/README.md: "Dots: Reading #7ee2b8, Dev #8ab4f8,
 * Ceramics #d3a8f0") — small literal hex values for an arbitrary
 * categorical axis, not theme tokens. Tuned for the dark surfaces rather
 * than reusing HIGHLIGHT_COLOR_MAP's light-mode `-200` pastels (from
 * @karakeep/shared-react/components/highlights), which read as washed-out,
 * low-contrast chips on a charcoal background.
 */
const HIGHLIGHT_DOT_COLOR: Record<ZHighlightColor, string> = {
  yellow: "#e8b14c",
  green: "#7ee2b8",
  blue: "#8ab4f8",
  red: "#e2726a",
};

/**
 * The all-highlights list's row. Deliberately not the `border-l-6px`
 * coloured-bar quote card used in the bookmark preview sidebar
 * (HighlightCard.tsx, left untouched — it's shared with the reader view and
 * out of scope here): a thick left accent border on every row is exactly
 * the generic "AI card" pattern the design research flags, and at list
 * density it would compete with the row dividers already doing that job.
 * A small dot borrowed from the sidebar's own list-marker language reads
 * as "this app's UI," not as a template default.
 */
export function DenseHighlightRow({ highlight }: { highlight: ZHighlight }) {
  const { mutate: deleteHighlight, isPending } = useDeleteHighlight({
    onSuccess: () => {
      toast({ description: "Highlight has been deleted!" });
    },
    onError: () => {
      toast({ description: "Something went wrong", variant: "destructive" });
    },
  });
  const navigate = useRowNavigate(`/dashboard/preview/${highlight.bookmarkId}`);

  return (
    <div
      {...navigate}
      className="border-k-border-soft hover:bg-k-surface-1/60 group relative flex cursor-pointer gap-[14px] border-t px-[18px] py-[14px]"
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-[6px]">
        {highlight.text && (
          <div className="flex items-start gap-[8px]">
            <span
              className="mt-[6px] size-[6px] flex-none rounded-full"
              style={{ background: HIGHLIGHT_DOT_COLOR[highlight.color] }}
              aria-hidden
            />
            <blockquote
              cite={highlight.bookmarkId}
              className="text-k-fg min-w-0 flex-1 text-[13.5px] italic leading-[1.5] tracking-[-0.01em] [text-wrap:pretty]"
            >
              {highlight.text}
            </blockquote>
          </div>
        )}

        {highlight.note && (
          <p className="text-k-summary line-clamp-2 max-w-[640px] pl-[14px] text-[12.5px] leading-[1.55] [text-wrap:pretty]">
            {highlight.note}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-[10px] pl-[14px] pt-[2px]">
          <Link
            href={`/dashboard/preview/${highlight.bookmarkId}`}
            className="font-k-mono text-k-fg-dim hover:text-k-fg-muted relative z-20 text-[11px]"
          >
            View source
          </Link>
        </div>
      </div>

      <div className="relative z-10 flex flex-none flex-col items-end gap-[10px]">
        <span className="font-k-mono text-k-timestamp text-[11px]">
          {formatCompactRelativeTime(highlight.createdAt)}
        </span>
        <button
          type="button"
          aria-label="Delete highlight"
          disabled={isPending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteHighlight({ highlightId: highlight.id });
          }}
          className="text-k-icon hover:text-k-fg-muted relative z-20 flex items-center justify-center"
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
