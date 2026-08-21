import type { Metadata } from "next";
import { DenseTagsView } from "@/components/dashboard/dense/tags/DenseTagsView";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("tags.all_tags")} | Karakeep`,
  };
}

// Swapped from the legacy AllTagsView (components/dashboard/tags/) to the
// dense-styled equivalent — mirrors the AllHighlights.tsx precedent: this
// route existed pre-fork with no dense styling and no sidebar entry, so it
// read as a leftover default screen. Not yet linked from DenseSidebar (its
// nav is mid-change on a separate WIP); reachable by URL for now.
export default async function TagsPage() {
  return <DenseTagsView />;
}
