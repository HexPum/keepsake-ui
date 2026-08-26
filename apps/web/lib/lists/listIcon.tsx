// Shared render helper for the pixelarticons-based list icon system. Reused
// at every list-icon display site so legacy emoji / unknown values always
// fall back to the folder icon instead of rendering raw text or throwing.
import { Icon } from "@iconify/react";

import { DEFAULT_LIST_ICON, PIXEL_ICON_NAME_SET } from "./pixelIcons";

export { DEFAULT_LIST_ICON };

/**
 * Pure function: resolves a stored `icon` value to a valid pixelarticons
 * icon name. Returns `raw` unchanged if it is a known icon name; otherwise
 * returns the folder fallback. Never returns a raw emoji.
 */
export function resolveListIconName(raw: string | null | undefined): string {
  if (raw && PIXEL_ICON_NAME_SET.has(raw)) {
    return raw;
  }
  return DEFAULT_LIST_ICON;
}

export function ListIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return (
    <Icon
      icon={`pixelarticons:${resolveListIconName(name)}`}
      className={className}
    />
  );
}
