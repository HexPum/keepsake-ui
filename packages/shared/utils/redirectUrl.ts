/**
 * Validates a redirect URL to prevent open redirect attacks.
 * Only allows:
 * - Relative paths starting with "/" that stay on this origin (neither "//"
 *   nor "/\" — see below)
 * - The karakeep:// scheme for the mobile app
 *
 * @returns The validated URL if valid, otherwise undefined.
 */
export function validateRedirectUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) {
    return undefined;
  }

  // Allow relative paths starting with "/", but reject anything whose second
  // character is another slash *or* a backslash. "/\evil.com" is the
  // backslash spelling of the protocol-relative "//evil.com": the WHATWG URL
  // parser normalises "\" to "/" for special schemes, so it would resolve to
  // a foreign origin just like "//" does.
  if (url.startsWith("/") && !/^[/\\]/.test(url.slice(1))) {
    return url;
  }

  // Allow karakeep:// scheme for mobile app deep links
  if (url.startsWith("karakeep://")) {
    return url;
  }

  // Reject all other schemes (http, https, javascript, data, etc.)
  return undefined;
}

/**
 * Checks if the redirect URL is a mobile app deep link.
 */
export function isMobileAppRedirect(url: string): boolean {
  return url.startsWith("karakeep://");
}
