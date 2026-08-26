import { describe, expect, it } from "vitest";

import { resolveListIconName } from "./listIcon";

describe("resolveListIconName", () => {
  it("falls back to folder for the legacy emoji default", () => {
    expect(resolveListIconName("📁")).toBe("folder");
  });

  it("falls back to folder for other legacy emoji", () => {
    expect(resolveListIconName("⭐️")).toBe("folder");
    expect(resolveListIconName("🗄️")).toBe("folder");
  });

  it("falls back to folder for an unknown string", () => {
    expect(resolveListIconName("not-a-real-icon")).toBe("folder");
  });

  it("falls back to folder for empty, null, and undefined", () => {
    expect(resolveListIconName("")).toBe("folder");
    expect(resolveListIconName(null)).toBe("folder");
    expect(resolveListIconName(undefined)).toBe("folder");
  });

  it("returns a known valid name unchanged", () => {
    expect(resolveListIconName("folder")).toBe("folder");
    expect(resolveListIconName("star")).toBe("star");
    expect(resolveListIconName("archive")).toBe("archive");
  });

  it("falls back to folder for a name that looks plausible but isn't in the set", () => {
    expect(resolveListIconName("folder-icon")).toBe("folder");
    expect(resolveListIconName("pixelarticons:folder")).toBe("folder");
    expect(resolveListIconName("Folder")).toBe("folder");
  });

  it("is case-sensitive: differently-cased valid names fall back to folder", () => {
    expect(resolveListIconName("FOLDER")).toBe("folder");
    expect(resolveListIconName("STAR")).toBe("folder");
    expect(resolveListIconName("Star")).toBe("folder");
  });

  it("does not trim whitespace before checking membership", () => {
    expect(resolveListIconName(" folder")).toBe("folder");
    expect(resolveListIconName("folder ")).toBe("folder");
    expect(resolveListIconName(" folder ")).toBe("folder");
    expect(resolveListIconName("\tfolder\n")).toBe("folder");
  });

  it("falls back to folder for whitespace-only strings", () => {
    expect(resolveListIconName(" ")).toBe("folder");
    expect(resolveListIconName("\n")).toBe("folder");
    expect(resolveListIconName("   ")).toBe("folder");
  });

  it("falls back to folder for other unicode/emoji beyond the spec's examples", () => {
    expect(resolveListIconName("😀")).toBe("folder");
    expect(resolveListIconName("❤️")).toBe("folder");
    expect(resolveListIconName("🚀")).toBe("folder");
    // combining/multi-codepoint emoji shouldn't slip through as "valid"
    expect(resolveListIconName("👨‍👩‍👧‍👦")).toBe("folder");
  });

  it("falls back to folder for prototype-pollution-shaped strings without throwing", () => {
    expect(resolveListIconName("__proto__")).toBe("folder");
    expect(resolveListIconName("constructor")).toBe("folder");
    expect(resolveListIconName("hasOwnProperty")).toBe("folder");
  });

  it("falls back to folder for pathologically long strings without throwing", () => {
    const huge = "a".repeat(100_000);
    expect(resolveListIconName(huge)).toBe("folder");
  });

  it("never returns a value outside the catalogue, even for numeric-looking strings", () => {
    // pixelarticons has names like "4g", "4k" - confirm digit-led names still
    // pass through unchanged when they ARE valid, and numeric junk falls back.
    expect(resolveListIconName("4g")).toBe("4g");
    expect(resolveListIconName("123")).toBe("folder");
    expect(resolveListIconName("0")).toBe("folder");
  });
});

describe("PIXEL_ICON_NAME_SET / PIXEL_ICON_NAMES catalogue", () => {
  it("is non-empty and every resolved name is present in the set", async () => {
    const { PIXEL_ICON_NAME_SET, PIXEL_ICON_NAMES } =
      await import("./pixelIcons");
    expect(PIXEL_ICON_NAMES.length).toBeGreaterThan(0);
    for (const name of PIXEL_ICON_NAMES) {
      expect(PIXEL_ICON_NAME_SET.has(name)).toBe(true);
    }
  });

  it("contains the pinned-row icons used by AllListsView (star, archive)", async () => {
    const { PIXEL_ICON_NAME_SET } = await import("./pixelIcons");
    expect(PIXEL_ICON_NAME_SET.has("star")).toBe(true);
    expect(PIXEL_ICON_NAME_SET.has("archive")).toBe(true);
  });
});
