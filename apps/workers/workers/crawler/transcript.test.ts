import { describe, expect, test } from "vitest";

import {
  isLikelyVideoUrl,
  isUselessVideoTitle,
  vttToPlainText,
} from "./transcript";

describe("vttToPlainText", () => {
  test("strips the header, cue numbers and timing lines", () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

1
00:00:01.360 --> 00:00:03.040
Hello there

2
00:00:03.100 --> 00:00:05.000
General Kenobi`;
    expect(vttToPlainText(vtt)).toBe("Hello there General Kenobi");
  });

  test("strips per-word timing spans from auto-generated tracks", () => {
    // The "orig" tracks YouTube serves carry a timing span per word.
    const vtt = `WEBVTT

00:00:18.800 --> 00:00:21.790 align:start position:0%
We're<00:00:19.039><c> no</c><00:00:19.359><c> strangers</c><00:00:19.840><c> to</c>`;
    expect(vttToPlainText(vtt)).toBe("We're no strangers to");
  });

  test("collapses the rolling-window repetition of auto-captions", () => {
    // Auto-captions repeat the tail of the previous cue so the on-screen text
    // appears to scroll. Verbatim, this triples the token count and reads like
    // a stutter.
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
the quick brown

00:00:02.000 --> 00:00:03.000
the quick brown fox

00:00:03.000 --> 00:00:04.000
the quick brown fox jumps`;
    expect(vttToPlainText(vtt)).toBe("the quick brown fox jumps");
  });

  test("drops exact duplicate cues", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
same line

00:00:02.000 --> 00:00:03.000
same line`;
    expect(vttToPlainText(vtt)).toBe("same line");
  });

  test("drops sound-effect-only cues", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
[Music]

00:00:02.000 --> 00:00:03.000
(applause)

00:00:03.000 --> 00:00:04.000
Actual speech`;
    expect(vttToPlainText(vtt)).toBe("Actual speech");
  });

  test("decodes html entities", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Bob &amp; Alice said &quot;hi&quot;`;
    expect(vttToPlainText(vtt)).toBe('Bob & Alice said "hi"');
  });

  test("returns an empty string for a track with no speech", () => {
    const vtt = `WEBVTT
Kind: captions

00:00:01.000 --> 00:00:02.000
[Music]`;
    expect(vttToPlainText(vtt)).toBe("");
  });
});

describe("isLikelyVideoUrl", () => {
  test.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=x",
    "https://www.instagram.com/reel/DbYeIj2IiwX/",
    "https://www.tiktok.com/@user/video/123",
    "https://vimeo.com/123456",
  ])("recognises %s", (url) => {
    expect(isLikelyVideoUrl(url)).toBe(true);
  });

  test.each([
    "https://example.com/article",
    "https://github.com/foo/bar/issues/1",
    "not a url",
  ])("declines %s", (url) => {
    expect(isLikelyVideoUrl(url)).toBe(false);
  });

  test("matches subdomains but not lookalike suffixes", () => {
    expect(isLikelyVideoUrl("https://music.youtube.com/watch?v=x")).toBe(true);
    // A host that merely ends in the same characters must not match.
    expect(isLikelyVideoUrl("https://notyoutube.com/watch?v=x")).toBe(false);
  });
});

describe("isUselessVideoTitle", () => {
  test.each([
    ["- YouTube", "what a YouTube watch page actually stores"],
    ["", "empty"],
    ["   ", "whitespace only"],
    ["YouTube", "bare site name"],
    ["| Instagram", "bare site name with a separator"],
    ["TikTok", "bare site name"],
  ])("treats %j as useless (%s)", (title) => {
    expect(isUselessVideoTitle(title)).toBe(true);
  });

  test.each([
    "10 open source tools that feel illegal...",
    "the rejection myth",
    "How YouTube's algorithm works",
    "Starting to Teach Myself Electronics",
  ])("keeps the real title %j", (title) => {
    expect(isUselessVideoTitle(title)).toBe(false);
  });

  test("treats null and undefined as useless", () => {
    expect(isUselessVideoTitle(null)).toBe(true);
    expect(isUselessVideoTitle(undefined)).toBe(true);
  });
});
