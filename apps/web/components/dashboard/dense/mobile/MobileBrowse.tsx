"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EditListModal } from "@/components/dashboard/lists/EditListModal";
import {
  getDenseRowSource,
  getDenseRowTitle,
} from "@/lib/dense/bookmarkDisplay";
import { useQuery } from "@tanstack/react-query";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * The mobile browse() screen (design/Keepsake Mobile Designs.html, screen
 * 2d) — lists, tags and a "recently added" glance collapse onto one
 * screen rather than three tabs, per the design's own capture-screen note
 * ("Lists, tags and the grid view collapse into one browse surface rather
 * than three tabs") and the earlier call to fold Tags into this tab
 * instead of giving it a fifth slot (see MobileTabBar's doc comment).
 *
 * Scope boundary, not an oversight: this screen is the browse *overview*
 * only, matching what the design actually drew. Opening a list or a tag
 * from here (or the "All lists"/"All tags" links) lands on the existing
 * desktop list/tag detail pages, not yet mobile-styled — same boundary
 * Phase 3 already drew around `/dashboard/bookmarks`. Those pages remain
 * fully functional, just squeezed to phone width, until a later pass.
 */
export function MobileBrowse() {
  const api = useTRPC();
  const [newListOpen, setNewListOpen] = useState(false);
  const [expandedListId, setExpandedListId] = useState<string | null>(null);

  const { data: listsData } = useBookmarkLists();
  const { data: listStats } = useQuery(api.lists.stats.queryOptions());
  const { data: tagsData } = useQuery(
    api.tags.list.queryOptions({ sortBy: "usage" }),
  );
  const { data: recentData } = useQuery(
    api.bookmarks.getBookmarks.queryOptions({
      archived: false,
      sortOrder: "desc",
      limit: 4,
      includeContent: false,
      useCursorV2: true,
    }),
  );

  const isPending =
    listsData === undefined ||
    listStats === undefined ||
    tagsData === undefined;

  const topLevelLists = useMemo(
    () => (listsData?.data ?? []).filter((l) => !l.parentId),
    [listsData],
  );
  const tags = (tagsData?.tags ?? []).slice(0, 24);

  // Generate a deterministic color for each list based on icon
  const getListColor = (icon: string): string => {
    const colors = [
      "#f4a26b",
      "#7eb8a4",
      "#a89fd8",
      "#d4846a",
      "#b8a87e",
      "#7eabd8",
    ];
    return colors[Math.abs(icon.charCodeAt(0) % colors.length)];
  };

  return (
    <div className="flex h-full flex-col sm:hidden">
      {/* Header */}
      <div style={{ padding: "16px 0 0", animation: "fadeIn 0.2s ease" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px 18px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
            }}
          >
            LISTS
          </span>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            {!isPending ? `${topLevelLists.length} active` : ""}
          </span>
        </div>

        {/* List rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {isPending
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 20px",
                    background: "var(--surface-1)",
                    borderBottom: "1px solid var(--border)",
                    animation: `fadeIn 0.2s ease ${i * 0.05}s both`,
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "var(--border)",
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      height: 4,
                      background: "var(--border)",
                      borderRadius: 2,
                      flex: 1,
                    }}
                  />
                </div>
              ))
            : topLevelLists.length > 0
              ? topLevelLists.map((list, i) => (
                  <button
                    key={list.id}
                    onClick={() =>
                      setExpandedListId(
                        expandedListId === list.id ? null : list.id,
                      )
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "16px 20px",
                      background:
                        expandedListId === list.id
                          ? "var(--surface-1)"
                          : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      textAlign: "left",
                      animation: `fadeIn 0.2s ease ${i * 0.05}s both`,
                      transition: "background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: getListColor(list.icon),
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 14,
                        color: "var(--text)",
                        flex: 1,
                      }}
                    >
                      {list.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        color: "var(--text-faint)",
                      }}
                    >
                      {(listStats?.stats.get(list.id) ?? 0).toLocaleString()}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-faint)"
                      strokeWidth="1.6"
                      style={{
                        width: 14,
                        height: 14,
                        transform:
                          expandedListId === list.id ? "rotate(90deg)" : "none",
                        transition: "transform 0.15s",
                      }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                ))
              : null}
        </div>

        {/* New list button */}
        <div style={{ padding: "24px 20px 0" }}>
          <button
            onClick={() => setNewListOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "13px 16px",
              background: "var(--surface-1)",
              border: "1px dashed var(--border-2)",
              borderRadius: 12,
              cursor: "pointer",
              width: "100%",
              color: "var(--text-muted)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.8"
              style={{ width: 16, height: 16 }}
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              new_list
            </span>
          </button>
        </div>
      </div>

      {/* Tags and recently added sections (kept below for reference) */}
      {(tags.length > 0 || (recentData && recentData.bookmarks.length > 0)) && (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-[16px] pb-[24px] pt-[20px]"
          style={{ fontSize: "14px" }}
        >
          {tags.length > 0 && (
            <>
              <div className="flex items-center gap-[10px] pb-[12px]">
                <span
                  className="font-k-mono text-k-fg-dim text-[10px] tracking-[0.08em]"
                  style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                >
                  {"// tags"}
                </span>
                <div className="border-k-border h-px flex-1" />
              </div>
              <div className="flex flex-wrap gap-[7px] pb-[12px]">
                {tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/dashboard/tags/${tag.id}`}
                    className="border-k-border-soft text-k-fg-muted flex items-baseline gap-[6px] rounded-full border px-[12px] py-[5px] text-[12.5px]"
                  >
                    {tag.name}
                    <span className="font-k-mono text-k-fg-dim text-[10px]">
                      {tag.numBookmarks}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {recentData && recentData.bookmarks.length > 0 && (
            <>
              <div className="flex items-center gap-[10px] pb-[12px] pt-[12px]">
                <span
                  className="font-k-mono text-k-fg-dim text-[10px] tracking-[0.08em]"
                  style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                >
                  {"// recently_added"}
                </span>
                <div className="border-k-border h-px flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-[9px]">
                {recentData.bookmarks.map((bookmark) => (
                  <Link
                    key={bookmark.id}
                    href={`/dashboard/preview/${bookmark.id}`}
                    className="border-k-border bg-k-surface-1 flex flex-col gap-[7px] rounded-[12px] border p-[12px]"
                  >
                    {getDenseRowSource(bookmark) && (
                      <span className="font-k-mono text-k-fg-dim truncate text-[10px]">
                        {getDenseRowSource(bookmark)}
                      </span>
                    )}
                    <span className="text-k-fg line-clamp-2 text-[12.5px] font-semibold leading-[1.35]">
                      {getDenseRowTitle(bookmark)}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <EditListModal open={newListOpen} setOpen={setNewListOpen} />
    </div>
  );
}
