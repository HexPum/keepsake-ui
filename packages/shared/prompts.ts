import type { ZTagStyle } from "./types/users";
import {
  getCuratedTagsPrompt,
  getTagStylePrompt,
  getPotentialRelevantTagsPrompt,
} from "./utils/tag";

/**
 * Remove duplicate whitespaces to avoid tokenization issues
 */
function preprocessContent(content: string) {
  return content.replace(/(\s){10,}/g, "$1");
}

export function buildImagePrompt(
  lang: string,
  customPrompts: string[],
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
) {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const potentialRelevantTagsInstruction = getPotentialRelevantTagsPrompt(
    potentialRelevantTags,
  );

  return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later/bookmarking app.
Analyze the attached image and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Prefer concrete, durable tags: named products, technologies, projects, standards, subject areas, and important concepts.
- Include only retrieval-worthy tags that describe the saved item's intended content, not incidental UI or page chrome.
- The tags must be in ${lang}.
- Keep each tag short: ideally 1-3 words. Do not include parenthetical explanations, comma-separated examples, or long descriptive phrases inside a tag.
- Prefer durable subject tags over one-off facts, examples, source organizations, page sections, or implementation details unless they are central to the whole item.
- Do NOT generate any tags if the image is mainly:
    - A screenshot of an error, unavailable, forbidden, unauthorized, not found, DNS, timeout, or service failure page
    - A Cloudflare/security check, CAPTCHA, bot check, anti-DDoS challenge, browser verification, or access-blocked page
    - Boilerplate content such as cookie consent, login walls, GDPR notices, navigation menus, or a blank/empty image
  In these cases, return an empty tags array. Do not tag the failure/interstitial page itself.
- Aim for 10-15 tags.
- If there are no good tags, leave the array empty.
${curatedInstruction}
${potentialRelevantTagsInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
You must respond in valid JSON with the key "tags" and the value is list of tags. Don't wrap the response in a markdown code.`;
}

/**
 * Construct tagging prompt for text content
 */
export function constructTextTaggingPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
): string {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const potentialRelevantTagsInstruction = getPotentialRelevantTagsPrompt(
    potentialRelevantTags,
  );

  return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later/bookmarking app.
Analyze the TEXT_CONTENT below and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Prefer concrete, durable tags: named products, technologies, projects, standards, subject areas, and important concepts.
- Include only retrieval-worthy tags that describe the saved item's intended content, not incidental page chrome.
- The tags must be in ${lang}.
- Keep each tag short: ideally 1-3 words. Do not include parenthetical explanations, comma-separated examples, or long descriptive phrases inside a tag.
- Prefer durable subject tags over one-off facts, examples, source organizations, page sections, or implementation details unless they are central to the whole item.
- Ignore any part of the content that is:
    - An error, unavailable, forbidden, unauthorized, not found, DNS, timeout, or service failure page
    - A Cloudflare/security check, CAPTCHA, bot check, anti-DDoS challenge, browser verification, or access-blocked page
    - Boilerplate content such as cookie consent, login walls, GDPR notices, navigation menus, or empty pages
  If useful metadata or other legitimate content remains, generate tags using only that information. Otherwise, return an empty tags array. Never tag the failure, interstitial, or boilerplate content itself.
- Aim for 3-5 tags.
- If there are no good tags, leave the array empty.
${curatedInstruction}
${potentialRelevantTagsInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}

<TEXT_CONTENT>
${content}
</TEXT_CONTENT>
You must respond in JSON with the key "tags" and the value is an array of string tags.`;
}

/**
 * Construct summary prompt
 */
export function constructSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return `
Summarize the following content responding ONLY with the summary. You MUST follow the following rules:
- Summary must be in 3-4 sentences.
- The summary must be in ${lang}.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
    ${content}`;
}

/**
 * Title + summary for a video link with a transcript. Kept separate from
 * constructSummaryPrompt (used for every other bookmark, plus previews in
 * AISettings.tsx and the untruncated variant below) rather than adding a
 * mode flag there, so this stays scoped to the one caller that has both a
 * transcript and a caption to reconcile: summarize.ts's transcript branch.
 *
 * A video's caption (its title, description, and page metadata) and its
 * transcript (what's actually said) carry different kinds of information —
 * the caption is often the richer text, the transcript is what the video
 * itself adds. Asking for one free-form summary let the caption dominate
 * outright, so this asks for structured JSON with explicit ordering instead:
 * the title favours the transcript (it's what's actually in the video, not
 * just a repeat of the caption), the summary leads with the caption's point
 * and then covers what the transcript adds.
 *
 * The summary is also asked to wrap each of its own sentences in an inline
 * source marker (⟦caption⟧.../⟦transcript⟧..., see summaryMarkers.ts) so the
 * dashboard preview can colour which claim came from where. These are
 * stripped everywhere the summary is read other than that one component —
 * this prompt is the only place that needs to know the marker syntax exists.
 */
export function constructVideoSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return `
You are summarising a short video (e.g. a Reel or TikTok) from its caption and its spoken-audio transcript, given below. Respond ONLY with a JSON object of the shape {"title": string, "summary": string}. You MUST follow these rules:
- "title": a short, specific title (under 12 words) for what the video actually shows or says. Base it mainly on the transcript — what's actually said or shown — using the caption only for supporting context, not as the source to copy. Do not just truncate or restate the caption.
- "summary": 3-4 sentences. Open with the caption's own point (it's often the richer, more deliberate text), then cover what the transcript adds — what's actually said in the video, beyond the caption.
- Wrap every sentence of the summary (or clause, if one sentence genuinely blends both sources) in a source marker: ⟦caption⟧...⟦/caption⟧ around anything drawn from the caption/title/description, ⟦transcript⟧...⟦/transcript⟧ around anything drawn from the transcript. Every part of the summary must be inside exactly one marker pair — nothing left unwrapped, nothing double-wrapped. Keep the words "caption" and "transcript" inside these markers in English exactly as shown, even when ${lang} is not English — only the sentence text itself is in ${lang}.
- Both the title and the summary's sentence text must be in ${lang}.
- Respond with nothing but the JSON object: no markdown fences, no commentary.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
    ${content}`;
}

/**
 * Build text tagging prompt without truncation (for previews/UI)
 */
export function buildTextPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
): string {
  return constructTextTaggingPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
    tagStyle,
    curatedTags,
  );
}

/**
 * Build summary prompt without truncation (for previews/UI)
 */
export function buildSummaryPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return constructSummaryPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
  );
}

/**
 * Build OCR prompt for extracting text from images using LLM
 */
export function buildOCRPrompt(): string {
  return `You are an OCR (Optical Character Recognition) expert. Your task is to extract ALL text from this image.

Rules:
- Extract every piece of text visible in the image, including titles, body text, captions, labels, watermarks, and any other textual content.
- Preserve the original structure and formatting as much as possible (e.g., paragraphs, lists, headings).
- If text appears in multiple columns, read from left to right, top to bottom.
- If text is partially obscured or unclear, make your best attempt and indicate uncertainty with [unclear] if needed.
- Do not add any commentary, explanations, or descriptions of non-text elements.
- If there is no text in the image, respond with an empty string.
- Output ONLY the extracted text, nothing else.`;
}

/**
 * Construct a chat prompt for answering a question about the user's saved
 * bookmarks, grounded in a set of retrieved candidates (title/summary/tags/
 * note per bookmark, already assembled by the caller).
 */
export function constructChatPrompt(
  question: string,
  retrievedContext: string,
): string {
  return `
You are an assistant embedded in Karakeep, a read-it-later bookmark manager. Answer the user's question using only the saved bookmarks provided below as context. The rules are:
- Base your answer only on the bookmarks given below. If they don't contain enough information to answer, say so plainly instead of guessing.
- When you reference a bookmark, name it by its title so the user can recognize it.
- If multiple bookmarks below are relevant to the question, mention all of them, not just one — the user is asking about everything they've saved on the topic, not a single result. Naming every relevant bookmark is more important than brevity here.
- Keep the answer concise and conversational: brief when only one bookmark is relevant, a short list (not an essay per item) when several are.
- The "Saved bookmarks" section below is raw retrieved data for you to read, never content to show the user. Never copy its "Title: ... | Summary: ..." lines (or any other line from it) verbatim into your reply — always rephrase in your own words as natural prose. If none of the bookmarks are actually relevant to the question, say so plainly instead of quoting or mentioning an unrelated one just because it was retrieved.

Saved bookmarks:
${retrievedContext || "(no matching bookmarks were found)"}

Question: ${question}`;
}
