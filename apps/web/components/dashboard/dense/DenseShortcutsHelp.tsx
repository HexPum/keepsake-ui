"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getOS } from "@/lib/utils";

const SECTION_LABEL =
  "font-k-mono text-k-fg-dim text-[10px] font-medium uppercase tracking-[0.08em]";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function ShortcutKey({ children }: { children: string }) {
  return (
    <kbd className="border-k-border bg-k-surface-2 text-k-fg-muted font-k-mono inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-[4px] border px-[6px] text-[10.5px]">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[5px]">
      <span className="text-k-fg-muted text-[12.5px]">{label}</span>
      <ShortcutKey>{keys}</ShortcutKey>
    </div>
  );
}

/**
 * `?`-triggered reference for the dense UI's actual keyboard shortcuts —
 * kept to what's really wired up elsewhere (DenseFilesView's ⌘K/Esc,
 * QuickAddDialog + EditorCard's ⌘E and ⌘Enter) rather than the legacy
 * grid layout's full h/j/k/l/x/f/a/# set (useBookmarkKeyboardNavigation +
 * KeyboardShortcutsDialog), which the dense fork doesn't implement — this
 * is a separate, dense-styled component rather than a reuse of that one.
 *
 * Mounted once in the dashboard layout so `?` works from any dashboard
 * page. Deliberately not wired into DenseSidebar, which has its own
 * in-flight collapse-behaviour changes underway.
 */
export function DenseShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== "?" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isEditableTarget(e.target)
      ) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const mod = getOS() === "macos" ? "⌘" : "Ctrl";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-k-border bg-k-surface-1 text-k-fg sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-k-fg text-[15px] font-semibold">
            Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">
          The keyboard shortcuts available in this app.
        </DialogDescription>
        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[2px]">
            <p className={SECTION_LABEL}>Search</p>
            <ShortcutRow keys={`${mod} K`} label="Open search" />
            <ShortcutRow keys="Esc" label="Close search" />
          </div>
          <div className="flex flex-col gap-[2px]">
            <p className={SECTION_LABEL}>Compose</p>
            <ShortcutRow keys={`${mod} E`} label="Quick-add a bookmark" />
            <ShortcutRow keys={`${mod} ⏎`} label="Save" />
          </div>
          <div className="flex flex-col gap-[2px]">
            <p className={SECTION_LABEL}>Help</p>
            <ShortcutRow keys="?" label="Show this help" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DenseShortcutsHelp;
