import { TagDuplicationDetection } from "@/components/dashboard/cleanups/TagDuplicationDetention";

// TagDuplicationDetection owns its own header/chrome now — mirrors the
// AllHighlights split (highlights/page.tsx), instead of wrapping it in a
// generic icon+heading bordered card the way this page used to.
export default function Cleanups() {
  return <TagDuplicationDetection />;
}
