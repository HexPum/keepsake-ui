import fs from "fs";
import * as os from "os";
import path from "path";
import { execa } from "execa";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

/**
 * Spoken-content extraction for links that point at a video.
 *
 * Video pages are the one case where crawling the HTML tells us nothing. A
 * YouTube watch page renders its content with JS, so the crawler stores an
 * empty `htmlContent` and a `description` that is YouTube's own boilerplate —
 * byte-identical across every video on the site. Summarising from that
 * produced summaries *of YouTube*, e.g. "YouTube is a platform where you can
 * find the latest videos and audio tracks", for every video anyone saved.
 *
 * Two sources, tried in order:
 *
 *   1. A real subtitle track via yt-dlp. Cheap (a few KB, a couple of
 *      seconds), accurate, and available for most of YouTube and Vimeo.
 *   2. Speech recognition over the audio, for everything with no track at all
 *      — which is essentially all short-form video (Reels, TikTok). Costs
 *      roughly real-time on CPU, so it's opt-in and duration-capped.
 */

const TMP_FOLDER = path.join(os.tmpdir(), "transcripts");

export type TranscriptSource = "captions" | "asr";

export interface Transcript {
  text: string;
  source: TranscriptSource;
  lang?: string;
}

/**
 * Hosts worth spending a yt-dlp invocation on.
 *
 * yt-dlp supports well over a thousand sites, and the honest way to ask
 * whether a URL is one of them is to run it and see. But this check sits in
 * the crawl path for *every* bookmark, and spawning yt-dlp on every blog post
 * and GitHub issue to be told "Unsupported URL" would add seconds to each one.
 * A host list keeps the common cases fast and simply declines to guess about
 * the long tail; anything missed still gets the normal HTML-based summary.
 */
const VIDEO_HOSTS = [
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "vimeo.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "twitch.tv",
  "dailymotion.com",
  "reddit.com",
  "facebook.com",
  "soundcloud.com",
  "bilibili.com",
  "odysee.com",
  "rumble.com",
];

export function isLikelyVideoUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return VIDEO_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

/**
 * Turns a WebVTT cue stream into readable prose.
 *
 * Auto-generated captions are not sentences — they're a rolling window, where
 * each cue repeats the tail of the previous one so the on-screen text appears
 * to scroll. Feeding that to a model verbatim triples the token count and
 * reads like a stutter. Cue payloads also carry per-word timing spans
 * (`We're<00:00:19.039><c> no</c>`) on the "orig" tracks.
 */
export function vttToPlainText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();

    if (!line) continue;
    // Headers and block metadata.
    if (line.startsWith("WEBVTT")) continue;
    if (/^(Kind|Language|NOTE|STYLE|REGION):?/i.test(line)) continue;
    // Timing lines, with or without trailing cue-position settings.
    if (line.includes("-->")) continue;
    // Bare cue identifiers (a lone number before a timing line).
    if (/^\d+$/.test(line)) continue;

    // Per-word timing spans and any other cue markup.
    line = line.replace(/<[^>]*>/g, "");
    // `&nbsp;` and friends show up in some publisher-authored tracks.
    line = line
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
    line = line.replace(/\s+/g, " ").trim();

    if (!line) continue;
    // Sound-effect-only cues carry no information for a summary.
    if (/^\[[^\]]*\]$/.test(line)) continue;
    if (/^\(\s*[^)]*\s*\)$/.test(line)) continue;

    // The rolling-window duplicate: identical to the line before it, or fully
    // contained in it (the previous cue already showed this text).
    const prev = out[out.length - 1];
    if (prev) {
      if (prev === line) continue;
      if (prev.endsWith(line)) continue;
      if (line.startsWith(prev)) {
        // The cue grew — keep the longer version instead of both.
        out[out.length - 1] = line;
        continue;
      }
    }
    out.push(line);
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Cut on a word boundary so the model isn't handed a severed token, and say
  // so explicitly — a silently truncated transcript reads as a video that
  // simply stops, and the summary confidently describes it as such.
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : cut.length)} […transcript truncated]`;
}

async function cleanupDir(dir: string) {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // Best effort — a leftover temp dir is not worth failing a crawl over.
  }
}

/**
 * Fetches a subtitle track, trying each configured language in turn.
 *
 * One language per invocation, deliberately. yt-dlp's `--sub-langs` accepts
 * globs, but `"en.*"` matches en-orig, en-en, en-de-DE and every other
 * translated variant, and yt-dlp then downloads *all* of them — which walked
 * straight into YouTube's `HTTP Error 429: Too Many Requests` in testing.
 */
async function fetchCaptions(
  url: string,
  proxy: string | undefined,
  signal: AbortSignal | undefined,
  jobLabel: string,
): Promise<Transcript | null> {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sub-"));

  try {
    for (const lang of serverConfig.crawler.videoTranscriptLangs) {
      const args = [
        url,
        "--skip-download",
        // `--skip-download` stops the *transfer*, but yt-dlp still resolves a
        // video format first and aborts the whole run if it can't find one.
        // YouTube increasingly serves SABR-only streams that yt-dlp cannot
        // resolve, so without this a subtitle-only fetch dies with "Requested
        // format is not available" on videos whose captions are right there
        // and perfectly downloadable.
        "--ignore-no-formats-error",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        lang,
        "--sub-format",
        "vtt",
        "--no-playlist",
        "--no-warnings",
        "-o",
        path.join(workDir, "sub"),
      ];
      if (proxy) {
        args.push("--proxy", proxy);
      }
      args.push(...serverConfig.crawler.ytDlpArguments);

      try {
        await execa("yt-dlp", args, {
          cancelSignal: signal,
          timeout: serverConfig.crawler.videoTranscriptTimeoutSec * 1000,
        });
      } catch (e) {
        const err = e as Error & { stderr?: string };
        const detail = err.stderr ?? err.message;
        if (detail.includes("429")) {
          // Backing off matters more than trying the next language: another
          // request right now makes the rate limiting worse, not better.
          logger.warn(
            `${jobLabel} Rate limited while fetching "${lang}" subtitles. Giving up on captions for this URL.`,
          );
          return null;
        }
        logger.debug(
          `${jobLabel} No "${lang}" subtitles (${detail.split("\n")[0]})`,
        );
        continue;
      }

      const files = (await fs.promises.readdir(workDir)).filter((f) =>
        f.endsWith(".vtt"),
      );
      if (files.length === 0) continue;

      // Prefer the plain track over an "orig" one: both carry the same words,
      // but the orig variant is the per-word-timed version that needs far more
      // cleaning and dedupes less reliably.
      files.sort((a, b) => {
        const aOrig = a.includes("orig") ? 1 : 0;
        const bOrig = b.includes("orig") ? 1 : 0;
        return aOrig - bOrig;
      });

      const raw = await fs.promises.readFile(
        path.join(workDir, files[0]),
        "utf8",
      );
      const text = vttToPlainText(raw);
      if (!text) continue;

      logger.info(
        `${jobLabel} Extracted a ${text.length} char "${lang}" subtitle track.`,
      );
      return { text, source: "captions", lang };
    }
    return null;
  } finally {
    await cleanupDir(workDir);
  }
}

/**
 * Transcribes the audio with whisper.cpp, for video with no subtitle track.
 *
 * Requires ffmpeg (yt-dlp shells out to it to extract and resample the audio)
 * and a whisper.cpp build plus a model file. All three are checked rather than
 * assumed: a missing binary should degrade to "no transcript", never fail the
 * crawl.
 */
async function transcribeAudio(
  url: string,
  proxy: string | undefined,
  signal: AbortSignal | undefined,
  jobLabel: string,
): Promise<Transcript | null> {
  const { asrEnabled, asrBinary, asrModel, asrLanguage, asrMaxDurationSec } =
    serverConfig.crawler;

  if (!asrEnabled) return null;
  if (!asrModel) {
    logger.warn(
      `${jobLabel} ASR is enabled but CRAWLER_ASR_MODEL is unset. Skipping transcription.`,
    );
    return null;
  }
  if (!fs.existsSync(asrModel)) {
    logger.warn(
      `${jobLabel} ASR model "${asrModel}" does not exist. Skipping transcription.`,
    );
    return null;
  }

  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "asr-"));
  const audioPath = path.join(workDir, "audio.wav");

  try {
    // Refuse over-long audio before paying to download it. whisper.cpp on CPU
    // runs at roughly real time, so an hour-long video would hold the worker
    // for an hour.
    try {
      const { stdout } = await execa(
        "yt-dlp",
        [
          url,
          "--no-playlist",
          "--print",
          "%(duration)s",
          "--skip-download",
          "--ignore-no-formats-error",
        ],
        { cancelSignal: signal, timeout: 60_000 },
      );
      const duration = Number.parseFloat(stdout.trim());
      if (Number.isFinite(duration) && duration > asrMaxDurationSec) {
        logger.info(
          `${jobLabel} Skipping transcription: ${Math.round(duration)}s of audio exceeds the ${asrMaxDurationSec}s cap.`,
        );
        return null;
      }
    } catch {
      // Duration is an optimisation, not a requirement — if the probe fails,
      // fall through and let the ASR timeout be the backstop.
    }

    // 16kHz mono PCM is what whisper.cpp expects; anything else makes it
    // resample internally or refuse the file outright.
    const dlArgs = [
      url,
      "--no-playlist",
      "--no-warnings",
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "wav",
      "--postprocessor-args",
      "ffmpeg:-ar 16000 -ac 1",
      "-o",
      path.join(workDir, "audio.%(ext)s"),
    ];
    if (proxy) {
      dlArgs.push("--proxy", proxy);
    }
    dlArgs.push(...serverConfig.crawler.ytDlpArguments);

    try {
      await execa("yt-dlp", dlArgs, {
        cancelSignal: signal,
        timeout: serverConfig.crawler.asrTimeoutSec * 1000,
      });
    } catch (e) {
      const err = e as Error & { stderr?: string };
      logger.warn(
        `${jobLabel} Could not extract audio: ${(err.stderr ?? err.message).split("\n")[0]}`,
      );
      return null;
    }

    if (!fs.existsSync(audioPath)) {
      logger.debug(`${jobLabel} No audio file produced. Skipping ASR.`);
      return null;
    }

    const outPrefix = path.join(workDir, "out");
    const asrArgs = [
      "-m",
      asrModel,
      "-f",
      audioPath,
      "--output-txt",
      "--output-file",
      outPrefix,
      // Progress output is noise in a worker log.
      "--no-prints",
    ];
    if (asrLanguage && asrLanguage !== "auto") {
      asrArgs.push("-l", asrLanguage);
    }

    try {
      await execa(asrBinary, asrArgs, {
        cancelSignal: signal,
        timeout: serverConfig.crawler.asrTimeoutSec * 1000,
      });
    } catch (e) {
      const err = e as Error & { stderr?: string; code?: string };
      if (err.code === "ENOENT") {
        logger.warn(
          `${jobLabel} ASR binary "${asrBinary}" not found on PATH. Skipping transcription.`,
        );
        return null;
      }
      logger.warn(
        `${jobLabel} Transcription failed: ${(err.stderr ?? err.message).split("\n")[0]}`,
      );
      return null;
    }

    const txtPath = `${outPrefix}.txt`;
    if (!fs.existsSync(txtPath)) {
      logger.warn(`${jobLabel} Transcription produced no output file.`);
      return null;
    }

    const text = (await fs.promises.readFile(txtPath, "utf8"))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return null;

    logger.info(
      `${jobLabel} Transcribed ${text.length} chars of audio via ${asrBinary}.`,
    );
    return { text, source: "asr" };
  } finally {
    await cleanupDir(workDir);
  }
}

/**
 * Best available transcript for a URL, or null if there isn't one.
 *
 * Never throws: a transcript is an enhancement to the summary, and no failure
 * mode here should be able to fail the crawl that asked for it.
 */
export async function extractTranscript({
  url,
  proxy,
  signal,
  jobId,
}: {
  url: string;
  proxy?: string;
  signal?: AbortSignal;
  jobId?: string;
}): Promise<Transcript | null> {
  const jobLabel = `[transcript][${jobId ?? "-"}]`;

  if (!serverConfig.crawler.videoTranscript) return null;
  if (!isLikelyVideoUrl(url)) return null;

  await fs.promises.mkdir(TMP_FOLDER, { recursive: true });

  try {
    const captions = await fetchCaptions(url, proxy, signal, jobLabel);
    const transcript =
      captions ?? (await transcribeAudio(url, proxy, signal, jobLabel));
    if (!transcript) {
      logger.debug(`${jobLabel} No transcript available for "${url}".`);
      return null;
    }
    return {
      ...transcript,
      text: truncate(
        transcript.text,
        serverConfig.crawler.videoTranscriptMaxChars,
      ),
    };
  } catch (e) {
    logger.warn(
      `${jobLabel} Transcript extraction failed for "${url}": ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return null;
  }
}
