/**
 * Parses a JSON object out of a raw LLM response.
 *
 * Models asked for JSON don't reliably give back just JSON — wrapped in a
 * markdown code fence, or with a stray sentence before/after the object, are
 * both common. Extracted from tagging.ts (its original, single caller) so
 * summarize.ts's video title+summary response can go through the same
 * tolerant parsing instead of a second, drifting copy of it.
 */
export function parseJsonFromLLMResponse(response: string): unknown {
  const trimmedResponse = response.trim();

  // Try parsing the response as-is first
  try {
    return JSON.parse(trimmedResponse);
  } catch {
    // If that fails, try to extract JSON from markdown code blocks
    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
    const match = trimmedResponse.match(jsonBlockRegex);

    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        // Fall through to other extraction methods
      }
    }

    // Try to find JSON object boundaries in the text
    const jsonObjectRegex = /\{[\s\S]*\}/;
    const objectMatch = trimmedResponse.match(jsonObjectRegex);

    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        // Fall through to final attempt
      }
    }

    // Last resort: try to parse the original response again to get the original error
    return JSON.parse(trimmedResponse);
  }
}
