import fs from "fs";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

/**
 * Authentication arguments shared by every yt-dlp invocation.
 *
 * Some sites serve nothing at all to a logged-out client. Instagram answers an
 * anonymous request for a Reel with an empty media response, so there is no
 * subtitle track to read and no audio to transcribe — the failure happens
 * before any of the transcript logic is reached, and no amount of speech
 * recognition helps.
 *
 * Kept in one place so the transcript fetch and the video download can't drift
 * into authenticating differently.
 */

let warnedMissingCookieFile = false;

export function ytDlpAuthArguments(): string[] {
  const { ytDlpCookiesFile, ytDlpCookiesFromBrowser } = serverConfig.crawler;

  if (ytDlpCookiesFile) {
    // Checked rather than assumed: a mount that silently didn't happen would
    // otherwise show up as "this site needs authentication" on every fetch,
    // which points at the wrong problem entirely.
    if (!fs.existsSync(ytDlpCookiesFile)) {
      if (!warnedMissingCookieFile) {
        warnedMissingCookieFile = true;
        logger.warn(
          `[ytdlp] CRAWLER_YTDLP_COOKIES_FILE is set to "${ytDlpCookiesFile}" but no such file exists. Continuing without authentication.`,
        );
      }
      return [];
    }
    return ["--cookies", ytDlpCookiesFile];
  }

  if (ytDlpCookiesFromBrowser) {
    return ["--cookies-from-browser", ytDlpCookiesFromBrowser];
  }

  return [];
}

/**
 * Whether the failure looks like "this needed a login".
 *
 * yt-dlp reports it differently per extractor, and the distinction matters:
 * an authentication failure is a configuration problem the operator can fix,
 * where an ordinary "no subtitles here" is just a fact about the video.
 */
export function isAuthenticationFailure(message: string): boolean {
  return (
    /empty media response/i.test(message) ||
    /--cookies/i.test(message) ||
    /log ?in|login required|requires authentication/i.test(message) ||
    // Both word orders occur across extractors: YouTube says "Private video",
    // Instagram says "This account is private".
    /private (video|account|post|reel)/i.test(message) ||
    /(video|account|post|reel) is private/i.test(message) ||
    /sign in to confirm/i.test(message)
  );
}
