#!/usr/bin/env python3
# Runs `node test/demo_output.js` and renders its real stdout into
# docs/local_test_output.png as plain monospace text with a disclaimer banner.
# This is not a screenshot of a real Google account; it is a picture of local
# mock test output.
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANNER_TEXT = "Local mock test output with fictional data. Not a real Google account screen."
MONO_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_SIZE = 15
LINE_SPACING = 6
MARGIN = 20
BANNER_PADDING = 14


def run_demo():
    result = subprocess.run(
        ["node", "test/demo_output.js"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        sys.stderr.write("node test/demo_output.js failed:\n")
        sys.stderr.write(result.stderr)
        sys.exit(1)
    return result.stdout.rstrip("\n").split("\n")


def main():
    lines = run_demo()
    mono = ImageFont.truetype(MONO_FONT_PATH, FONT_SIZE)
    bold = ImageFont.truetype(BOLD_FONT_PATH, FONT_SIZE)

    line_height = FONT_SIZE + LINE_SPACING
    char_width = mono.getlength("M")
    longest = max((len(l) for l in lines), default=0)

    banner_lines = [BANNER_TEXT]
    banner_height = BANNER_PADDING * 2 + len(banner_lines) * line_height

    width = int(max(longest * char_width, bold.getlength(BANNER_TEXT)) + MARGIN * 2)
    height = banner_height + MARGIN * 2 + len(lines) * line_height

    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    draw.rectangle([0, 0, width, banner_height], fill=(255, 247, 214))
    draw.text((MARGIN, BANNER_PADDING), BANNER_TEXT, font=bold, fill=(90, 70, 10))

    y = banner_height + MARGIN
    for line in lines:
        color = (20, 20, 20)
        font = mono
        if line.startswith("==="):
            color = (10, 10, 90)
            font = bold
        draw.text((MARGIN, y), line, font=font, fill=color)
        y += line_height

    out_path = os.path.join(REPO_ROOT, "docs", "local_test_output.png")
    img.save(out_path)
    print("Wrote " + out_path + " (" + str(width) + "x" + str(height) + ")")


if __name__ == "__main__":
    main()
