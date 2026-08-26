// Offline registration of the pixelarticons icon set for Iconify.
//
// The raw `pixelarticons` npm package only ships static SVG files with no
// runtime name -> element resolution. `@iconify-json/pixelarticons` packages
// the same set as an offline Iconify JSON dataset, which we register once
// here via `addCollection` so `<Icon icon="pixelarticons:folder" />` resolves
// fully offline (no network / Iconify API calls).
//
// Plain `.ts` module (no JSX) so it can be imported by server and client code
// alike, and by the pure `resolveListIconName` helper in `listIcon.tsx`.
import { addCollection } from "@iconify/react";

import iconSet from "@iconify-json/pixelarticons/icons.json";

addCollection(iconSet);

export const DEFAULT_LIST_ICON = "folder";

export const PIXEL_ICON_NAMES: string[] = Array.from(
  new Set([
    ...Object.keys(iconSet.icons),
    ...Object.keys(iconSet.aliases ?? {}),
  ]),
).sort();

export const PIXEL_ICON_NAME_SET = new Set<string>(PIXEL_ICON_NAMES);
