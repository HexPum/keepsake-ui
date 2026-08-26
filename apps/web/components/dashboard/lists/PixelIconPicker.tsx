"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ListIcon } from "@/lib/lists/listIcon";
import { PIXEL_ICON_NAMES } from "@/lib/lists/pixelIcons";
import { Search } from "lucide-react";

// Renders the full ~480+ icon grid unfiltered; only the filtered subset is
// ever rendered at once (capped) so a search narrows the render cost too.
const MAX_RENDERED = 240;

export function PixelIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = q
      ? PIXEL_ICON_NAMES.filter((name) => name.toLowerCase().includes(q))
      : PIXEL_ICON_NAMES;
    return names.slice(0, MAX_RENDERED);
  }, [query]);

  return (
    <div className="flex w-72 flex-col gap-2">
      <Input
        type="text"
        autoFocus
        placeholder="Search icons…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        startIcon={<Search className="size-4 text-muted-foreground" />}
      />
      <ScrollArea className="h-64">
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            No icons found
          </p>
        ) : (
          <div className="grid grid-cols-6 gap-1 p-1">
            {filtered.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                onClick={() => onChange(name)}
                className={cn(
                  "flex size-9 items-center justify-center rounded text-lg hover:bg-accent",
                  value === name && "bg-accent",
                )}
              >
                <ListIcon name={name} />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
