import { describe, expect, test } from "vitest";

import { isAuthenticationFailure } from "./ytdlpAuth";

describe("isAuthenticationFailure", () => {
  test("recognises Instagram's empty-media response", () => {
    // Verbatim from yt-dlp when fetching a public Reel while logged out —
    // the failure that makes Reels unsummarisable regardless of ASR.
    const err =
      "ERROR: [Instagram] DbYeIj2IiwX: Instagram sent an empty media response. " +
      "Check if this post is accessible in your browser without being logged-in. " +
      "If it is not, then use --cookies-from-browser or --cookies for the authentication.";
    expect(isAuthenticationFailure(err)).toBe(true);
  });

  test.each([
    "ERROR: Sign in to confirm your age",
    "ERROR: This video is private",
    "ERROR: This account is private",
    "ERROR: Login required to access this content",
  ])("recognises %s", (err) => {
    expect(isAuthenticationFailure(err)).toBe(true);
  });

  test.each([
    "ERROR: Requested format is not available",
    "ERROR: Unsupported URL: https://example.com",
    "ERROR: Video unavailable",
    "HTTP Error 429: Too Many Requests",
  ])("does not misread %s as an auth problem", (err) => {
    expect(isAuthenticationFailure(err)).toBe(false);
  });
});
