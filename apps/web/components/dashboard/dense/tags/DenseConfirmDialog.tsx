"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Generic in-UI confirm affordance for the tag-management view's
 * destructive actions (single-tag delete, bulk unused-tag cleanup) — no
 * native browser confirm()/alert(), per the dispatch's constraint. Reused
 * rather than duplicated per action so both destructive flows read and
 * behave identically.
 */
export function DenseConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  pending = false,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-k-border bg-k-surface-1 text-k-fg sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-k-fg text-[15px] font-semibold">
            {title}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-k-fg-muted text-[12.5px]">
          {description}
        </DialogDescription>
        <DialogFooter className="flex-row justify-end gap-[10px] pt-[6px]">
          <button
            type="button"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="border-k-border text-k-fg-muted hover:bg-k-surface-2 rounded-[7px] border px-[12px] py-[6px] text-[12.5px] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="rounded-[7px] bg-destructive px-[12px] py-[6px] text-[12.5px] text-destructive-foreground disabled:opacity-50"
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
