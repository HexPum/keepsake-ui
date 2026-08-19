#!/usr/bin/env python3
"""Pull the live Chrome Instagram session into a Netscape cookies.txt.

Why this exists rather than CRAWLER_YTDLP_COOKIES_FROM_BROWSER=chrome: the
workers run in a Linux container, and yt-dlp's --cookies-from-browser needs
both Chrome's profile directory and the macOS Keychain key that encrypts it.
Neither is reachable from inside the container. So the extraction happens out
here on the host, and the container mounts the resulting file read-only.

Only instagram.com cookies are written. The crawler needs nothing else, and a
file containing every session in the browser is a much worse thing to leave
lying on disk than one containing a single site's.

Run it with yt-dlp's own interpreter, which has the yt_dlp package:

    $(brew --prefix yt-dlp)/libexec/bin/python3 docker/export-ig-cookies.py

macOS will prompt for Keychain access ("Chrome Safe Storage") the first time.
Re-run whenever Instagram invalidates the session — the crawler will start
logging "empty media response" when that happens.
"""

import os
import sys

try:
    from yt_dlp.cookies import extract_cookies_from_browser
    from yt_dlp.utils import YoutubeDLCookieJar
except ModuleNotFoundError:
    sys.exit(
        "yt_dlp is not importable by this interpreter.\n"
        "Run with yt-dlp's own python, e.g.\n"
        "  $(brew --prefix yt-dlp)/libexec/bin/python3 docker/export-ig-cookies.py"
    )

DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ig-cookies.txt")
OUT = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
BROWSER = os.environ.get("COOKIE_BROWSER", "chrome")


class _Logger:
    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        print(f"warn: {msg}", file=sys.stderr)

    def error(self, msg):
        print(f"error: {msg}", file=sys.stderr)


def main():
    jar = extract_cookies_from_browser(BROWSER, logger=_Logger())

    out = YoutubeDLCookieJar()
    total = 0
    for cookie in jar:
        total += 1
        if cookie.domain == "instagram.com" or cookie.domain.endswith(".instagram.com"):
            out.set_cookie(cookie)

    names = sorted({c.name for c in out})
    if "sessionid" not in names:
        print(
            "No 'sessionid' cookie found — Chrome does not look logged in to "
            "Instagram. Log in, then re-run.",
            file=sys.stderr,
        )

    # 0600 before anything is written into it.
    fd = os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.close(fd)
    out.save(OUT, ignore_discard=True, ignore_expires=True)
    os.chmod(OUT, 0o600)

    print(f"cookies in {BROWSER}    : {total}")
    print(f"instagram.com kept   : {len(list(out))}")
    print(f"names                : {', '.join(names) or '(none)'}")
    print(f"logged in (sessionid): {'sessionid' in names}")
    print(f"wrote                : {OUT} (0600)")
    return 0 if "sessionid" in names else 1


if __name__ == "__main__":
    sys.exit(main())
