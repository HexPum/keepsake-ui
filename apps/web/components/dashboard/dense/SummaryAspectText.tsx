"use client";

import { Fragment } from "react";
import { useDenseThemeContext } from "@/components/dashboard/dense/DenseThemeController";
import { topicColorsFor } from "@/lib/dense/theme";

import {
  splitSummaryByMarkers,
  SummaryAspect,
} from "@karakeep/shared/summaryMarkers";

const ASPECT_TITLE: Record<SummaryAspect, string> = {
  caption: "From the caption",
  transcript: "From the transcript",
};

/**
 * Drop-in replacement for rendering summary prose as a plain string — a
 * fragment, not a block element, so it inherits whatever <p>/<span> the
 * caller already wraps it in. Colours the spans the video-summary prompt
 * tagged by source (caption vs transcript, see summaryMarkers.ts) using the
 * active accent for caption and the next accent in the theme's rotation for
 * transcript, so the treatment always matches whichever accent is selected.
 *
 * Text with no markers — every non-video summary, and any video summary the
 * model didn't tag — renders completely unchanged: this is additive only.
 */
export function SummaryAspectText({ text }: { text: string }) {
  const { preference } = useDenseThemeContext();
  const spans = splitSummaryByMarkers(text);
  const colors = topicColorsFor(preference.accent);

  const colorFor = (aspect: SummaryAspect | null) => {
    if (aspect === "caption") return colors[0];
    if (aspect === "transcript") return colors[1];
    return null;
  };

  return (
    <>
      {spans.map((span, i) => {
        const color = colorFor(span.aspect);
        if (!color) return <Fragment key={i}>{span.text}</Fragment>;
        return (
          <span
            key={i}
            title={ASPECT_TITLE[span.aspect!]}
            style={{
              borderLeft: `2px solid ${color}`,
              backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
              borderRadius: "0 3px 3px 0",
              paddingLeft: "6px",
              paddingRight: "2px",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {span.text}
          </span>
        );
      })}
    </>
  );
}
