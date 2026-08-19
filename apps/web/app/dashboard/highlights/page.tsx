import type { Metadata } from "next";
import AllHighlights from "@/components/dashboard/highlights/AllHighlights";
import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.highlights")} | Karakeep`,
  };
}

// Server-fetches the first page and hands off to the dense client view,
// which now owns its own header/search chrome — mirrors the
// DenseFiles.tsx + DenseFilesView.tsx split used by Archive/Favourites.
export default async function HighlightsPage() {
  const highlights = await api.highlights.getAll({});
  return <AllHighlights highlights={highlights} />;
}
