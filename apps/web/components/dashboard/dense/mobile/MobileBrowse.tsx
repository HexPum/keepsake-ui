"use client";

import { useState } from "react";
import Link from "next/link";
import { EditListModal } from "@/components/dashboard/lists/EditListModal";
import { useQuery } from "@tanstack/react-query";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

/**
 * The mobile browse() screen — exact copy of Figma design (ListsScreen),
 * wired to keepsake-ui's backend data. Shows expandable lists with colors.
 *
 * Rendered on `/dashboard/lists` route, `sm:hidden`.
 */
export function MobileBrowse() {
  const api = useTRPC();
  const [isNewListOpen, setIsNewListOpen] = useState(false);

  const { data: listsData } = useBookmarkLists();
  const { data: listStats } = useQuery(api.lists.stats.queryOptions());

  const isPending = listsData === undefined || listStats === undefined;

  const lists = (listsData?.data ?? []).filter((l) => !l.parentId);

  // Generate a deterministic color for each list based on icon
  const listColors = [
    "#f4a26b",
    "#7eb8a4",
    "#a89fd8",
    "#d4846a",
    "#b8a87e",
    "#7eabd8",
  ];
  // Index by the first *code point*, not the first UTF-16 code unit. Every
  // emoji outside the BMP (📁 🚀 📚 📌 …) is a surrogate pair whose
  // charCodeAt(0) is the shared high surrogate — 55356 or 55357 — so all of
  // them collapsed onto just two of the six colours. Spreading the string
  // iterates code points, and the `undefined` guard covers an empty icon,
  // which previously indexed with NaN and produced a transparent dot.
  const getListColor = (icon: string): string => {
    const codePoint = [...icon][0]?.codePointAt(0);
    if (codePoint === undefined) return listColors[0];
    return listColors[codePoint % listColors.length];
  };

  return (
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
            fontFamily: 'var(--font-k-mono), "IBM Plex Mono", monospace',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
          }}
        >
          LISTS
        </span>
        <span
          style={{
            fontFamily: 'var(--font-k-mono), "IBM Plex Mono", monospace',
            fontSize: 11,
            color: "var(--k-fg-dim)",
          }}
        >
          {!isPending ? `${lists.length} active` : ""}
        </span>
      </div>

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
                  background: "var(--k-surface-1)",
                  borderBottom: "1px solid var(--k-border)",
                  animation: `fadeIn 0.2s ease ${i * 0.05}s both`,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "var(--k-border)",
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    height: 4,
                    background: "var(--k-border)",
                    borderRadius: 2,
                    flex: 1,
                  }}
                />
              </div>
            ))
          : lists.map((list, i) => (
              <Link
                key={list.id}
                href={`/dashboard/lists/${list.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 20px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--k-border)",
                  cursor: "pointer",
                  textAlign: "left",
                  animation: `fadeIn 0.2s ease ${i * 0.05}s both`,
                  transition: "background 0.15s",
                  textDecoration: "none",
                  color: "inherit",
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
                    fontFamily:
                      'var(--font-k-mono), "IBM Plex Mono", monospace',
                    fontSize: 14,
                    color: "var(--k-fg)",
                    flex: 1,
                  }}
                >
                  {list.name}
                </span>
                <span
                  style={{
                    fontFamily:
                      'var(--font-k-mono), "IBM Plex Mono", monospace',
                    fontSize: 12,
                    color: "var(--k-fg-dim)",
                  }}
                >
                  {(listStats?.stats.get(list.id) ?? 0).toLocaleString()}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--k-fg-dim)"
                  strokeWidth="1.6"
                  style={{ width: 14, height: 14 }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            ))}
      </div>

      <div style={{ padding: "24px 20px 0" }}>
        {/* Driven by `open`/`setOpen` rather than by wrapping the button in
            EditListModal's own DialogTrigger: passing no children means it
            renders no trigger at all, which keeps this off the
            `DialogTrigger asChild` → Slot path that the desktop "New List"
            button currently hydrates badly on. */}
        <EditListModal open={isNewListOpen} setOpen={setIsNewListOpen} />
        <button
          type="button"
          onClick={() => setIsNewListOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 16px",
            background: "var(--k-surface-1)",
            border: "1px dashed var(--k-border-soft)",
            borderRadius: 12,
            cursor: "pointer",
            width: "100%",
            color: "var(--k-fg-muted)",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--k-accent)"
            strokeWidth="1.8"
            style={{ width: 16, height: 16 }}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-k-mono), "IBM Plex Mono", monospace',
              fontSize: 12,
              color: "var(--k-fg-muted)",
            }}
          >
            new_list
          </span>
        </button>
      </div>
    </div>
  );
}
