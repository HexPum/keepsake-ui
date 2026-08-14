"use client";

import { useState } from "react";
import Link from "next/link";
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
  const [expandedListId, setExpandedListId] = useState<string | null>(null);

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
  const getListColor = (icon: string): string => {
    return listColors[Math.abs(icon.charCodeAt(0) % listColors.length)];
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
          : lists.map((list, i) => (
              <Link
                key={list.id}
                href={`/dashboard/lists/${list.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setExpandedListId(
                    expandedListId === list.id ? null : list.id,
                  );
                }}
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
              </Link>
            ))}
      </div>

      <div style={{ padding: "24px 20px 0" }}>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 16px",
            background: "var(--surface-1)",
            border: "1px dashed var(--border2)",
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
  );
}
