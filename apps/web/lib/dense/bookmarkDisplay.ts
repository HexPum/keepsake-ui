import { getDomainFromUrl } from "@/lib/dense/format";

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
