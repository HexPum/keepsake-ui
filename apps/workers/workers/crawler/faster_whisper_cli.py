#!/usr/bin/env python3
"""
Drop-in CLI shim so `transcript.ts` can point CRAWLER_ASR_BACKEND at
faster-whisper without needing a different argument-building path than the
whisper.cpp one it already has.

Accepts the same flags transcript.ts passes to `whisper-cli` (-m, -f,
--output-txt, --output-file, --no-prints, -l) and writes a plain-text
transcript to `<output-file>.txt`, matching whisper.cpp's `--output-txt`
convention exactly. `--output-txt` and `--no-prints` are accepted and
ignored: this script only ever writes text, and it only ever writes to
stderr, so both are already true.

-m/--model here is a faster-whisper model name (e.g. "small", "base.en"),
not a file path — faster-whisper downloads and caches it on first use, so
unlike whisper.cpp's .bin file there is nothing on disk to check for ahead
of time.
"""
import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-m", "--model", required=True)
    parser.add_argument("-f", "--file", required=True)
    parser.add_argument("--output-file", required=True)
    parser.add_argument("--output-txt", action="store_true")
    parser.add_argument("--no-prints", action="store_true")
    parser.add_argument("-l", "--language", default=None)
    args = parser.parse_args()

    language = None if args.language in (None, "auto") else args.language

    # Imported after arg parsing so `--help` doesn't pay for loading torch.
    from faster_whisper import WhisperModel

    print(f"[faster-whisper] loading model '{args.model}'...", file=sys.stderr)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    print(f"[faster-whisper] transcribing '{args.file}'...", file=sys.stderr)
    segments, info = model.transcribe(args.file, beam_size=5, language=language)
    print(
        f"[faster-whisper] detected language={info.language} "
        f"(p={info.language_probability:.2f})",
        file=sys.stderr,
    )

    text = " ".join(seg.text.strip() for seg in segments).strip()

    with open(f"{args.output_file}.txt", "w", encoding="utf-8") as f:
        f.write(text)

    print(f"[faster-whisper] wrote {len(text)} chars.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
