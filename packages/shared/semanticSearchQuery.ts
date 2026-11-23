/**
 * The meaning-search shortcut: `|| idea || another idea`.
 * Only a leading marker opts in; quoted markers and ordinary code/URLs stay
 * literal. Keep this independent of the filter parser so every caller can
 * recognize the same syntax before choosing a search mode.
 */
export function getSemanticSearchTerms(query: string): string[] | null {
  const input = query.trimStart();
  if (!input.startsWith("||")) return null;

  const terms: string[] = [];
  let quoted = false;
  let start = 2;
  for (let i = start; i < input.length; i++) {
    if (input[i] === '"') quoted = !quoted;
    if (!quoted && input.slice(i, i + 2) === "||") {
      terms.push(input.slice(start, i).trim());
      start = i + 2;
      i++;
    }
  }
  terms.push(input.slice(start).trim());
  return terms.filter(Boolean);
}

export const MAX_SEMANTIC_SEARCH_TERMS = 8;
