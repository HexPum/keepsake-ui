import {
  estimateReadingTimeFromWordCount,
  getDomainFromUrl,
} from "@/lib/dense/format";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

export function getDenseRowTitle(bookmark: ZBookmark) {
  if (bookmark.title) return bookmark.title;
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return bookmark.content.title ?? bookmark.content.url;
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.fileName ?? "Untitled asset";
  }
  return "Untitled note";
}

export function getDenseRowSource(bookmark: ZBookmark) {
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return getDomainFromUrl(bookmark.content.url);
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    return bookmark.content.assetType;
  }
  return null;
}

/**
 * The detail read-out's "Saved page" disclosure defaults closed, demoting a
 * link's crawled original (or an uploaded asset) to reference material below
 * the AI title/summary. A text (note) bookmark has no such original — that
 * disclosure IS the note's own typed body, not reference material — so it
 * should start open. Without this, a note with no title (nothing is
 * AI-generated for it) and no summary (notes aren't summarised) shows
 * nothing at all until the user thinks to expand a section labelled "Saved
 * page", which reads as if the typed text never saved.
 */
export function shouldDefaultOpenContentDisclosure(
  contentType: ZBookmark["content"]["type"],
) {
  return contentType === BookmarkTypes.TEXT;
}

const HTML_TAG_RE = /<[^>]+>/g;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Reading time for the detail view, estimated from the bookmark's actual
 * content — its crawled page markup, its typed note body, or an asset's
 * extracted text — rather than the row list's AI-summary proxy
 * (estimateReadingTimeMinutes in format.ts), which exists there only because
 * the list query never loads full content. Returns null when there's
 * nothing to estimate from yet (a link still crawling, an image with no
 * extracted text, ...).
 */
export function estimateDetailReadingTimeMinutes(
  bookmark: Pick<ZBookmark, "content">,
): number | null {
  const { content } = bookmark;
  let text: string | null | undefined;
  switch (content.type) {
    case BookmarkTypes.LINK:
      // htmlContent is the raw crawled markup — strip tags for a rough but
      // serviceable word count rather than pulling in a full HTML parser
      // just for an estimate.
      text = content.htmlContent?.replace(HTML_TAG_RE, " ");
      break;
    case BookmarkTypes.TEXT:
      text = content.text;
      break;
    case BookmarkTypes.ASSET:
      text = content.content;
      break;
    default:
      text = null;
  }
  if (!text) return null;
  return estimateReadingTimeFromWordCount(countWords(text));
}
