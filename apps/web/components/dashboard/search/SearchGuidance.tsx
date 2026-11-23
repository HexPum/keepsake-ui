"use client";

import { useTranslation } from "@/lib/i18n/client";

export function SearchGuidance({
  semanticSearchEnabled,
}: {
  semanticSearchEnabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <p className="text-k-fg-dim max-w-[520px] text-xs leading-relaxed">
      {t(semanticSearchEnabled ? "search.meaning_hint" : "search.keyword_hint")}
    </p>
  );
}
