"use client";

import { Fragment } from "react";
import { splitByQueryMatch } from "@/lib/dense/searchHighlight";

/**
 * Drop-in replacement for rendering row text as a plain string — a fragment,
 * not a block element — that highlights every place `query`'s words appear
 * in `text`, using the active theme accent so it reads as the same "marking"
 * language as the summary source-spans (SummaryAspectText) rather than a
 * disconnected yellow-highlighter look.
 *
 * An empty query renders `text` completely unchanged, so this is safe to use
 * unconditionally in a row that isn't always shown in search results.
 */
export function SearchMatchText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query.trim()) return <>{text}</>;

  return (
    <>
      {splitByQueryMatch(text, query).map((span, i) =>
        span.matched ? (
          <mark
            key={i}
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--k-accent) 30%, transparent)",
              color: "inherit",
              borderRadius: "2px",
              padding: "0 1px",
            }}
          >
            {span.text}
          </mark>
        ) : (
          <Fragment key={i}>{span.text}</Fragment>
        ),
      )}
    </>
  );
}
