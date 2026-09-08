#!/usr/bin/env python3
"""Generate every shell-owned BP Office asset from the distributor brand art.

Inputs (all committed, all supplied by the distributor):

* ``branding/source/icon.png`` - 1024px raster master used for the executable,
  installer, taskbar/dock and Linux icon set.
* ``branding/bpoffice-mark.svg`` - canonical monochrome vector mark traced from that
  master by ``tools/trace-brand-mark.py`` (re-run the tracer after replacing the master).
* ``branding/source/bpoffice-logo.svg`` - distributor wordmark; its letter paths are
  reused verbatim and re-colored with ``currentColor``.

Outputs (all under ``apps/shell`` so editor packages never mutate each other):

* ``build/icon.png``, ``build/icon-mac.png``, ``build/icon.ico``, ``build/icon.icns``
* ``build/bpoffice-mark.svg``, ``build/bpoffice-mark.png``
* ``build/icons/16x16.png`` through ``build/icons/1024x1024.png``
* ``src/renderer/src/assets/app-icon.png``
* ``src/renderer/src/assets/bpoffice-logo.svg`` - Home/onboarding lockup

The lockup and the mark are monochrome and use ``currentColor``, so they stay legible in
both themes without CSS filters. Requires Pillow only; no network access.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

from PIL import Image

BUILD_DIR = Path(__file__).resolve().parent
SHELL_DIR = BUILD_DIR.parent
REPO_ROOT = SHELL_DIR.parent.parent
BRANDING_DIR = REPO_ROOT / "branding"
SOURCE_ART = BRANDING_DIR / "source"
RENDERER_ASSETS = SHELL_DIR / "src" / "renderer" / "src" / "assets"

MASTER_ICON = SOURCE_ART / "icon.png"
MARK_VECTOR = BRANDING_DIR / "bpoffice-mark.svg"
WORDMARK_SOURCE = SOURCE_ART / "bpoffice-logo.svg"

ICON_SIZE = 1024
ICO_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
LINUX_ICON_SIZES = (16, 32, 48, 64, 128, 256, 512, 1024)
MAC_INSET = 128

# The distributor lockup canvas: the mark occupies a 240px square on the left and the
# letters start after it. Anything whose ink starts left of LETTER_MIN_X belongs to the
# mark tile and is replaced by the traced vector mark.
LOCKUP_VIEW = (0.0, 0.0, 1050.0, 240.0)
LETTER_MIN_X = 260.0
MARK_BOX = 240.0
MARK_VIEW_BOX = 1024

PATH_TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?")


def path_rings(d: str) -> list[list[tuple[float, float]]]:
    """Flatten an SVG path into closed rings of (x, y) points.

    Only the commands present in the distributor artwork are supported (M/L/H/V/C/S/Z in
    absolute and relative form); anything else fails loudly instead of silently dropping
    geometry that would change the brand.
    """
    tokens = PATH_TOKEN.findall(d)
    index = 0
    x = y = 0.0
    start_x = start_y = 0.0
    previous_control: tuple[float, float] | None = None
    previous_command = ""
    rings: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []

    def numbers(count: int) -> list[float]:
        nonlocal index
        values = [float(token) for token in tokens[index : index + count]]
        index += count
        return values

    def more_numbers() -> bool:
        return index < len(tokens) and not re.match(r"[A-Za-z]", tokens[index])

    def cubic(p0, p1, p2, p3) -> list[tuple[float, float]]:
        steps = max(4, int(math.dist(p0, p3) * 2 / 0.35) + 2)
        out = []
        for step in range(1, steps + 1):
            t = step / steps
            mt = 1 - t
            out.append(
                (
                    mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0],
                    mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1],
                )
            )
        return out

    while index < len(tokens):
        token = tokens[index]
        if re.match(r"[A-Za-z]", token):
            command = token
            index += 1
        else:
            command = previous_command
        lowered = command.lower()
        relative = command.islower()
        if lowered == "m":
            values = numbers(2)
            x, y = (x + values[0], y + values[1]) if relative else (values[0], values[1])
            if current:
                rings.append(current)
            current = [(x, y)]
            start_x, start_y = x, y
            previous_control = None
        elif lowered == "l":
            while more_numbers():
                values = numbers(2)
                x, y = (x + values[0], y + values[1]) if relative else (values[0], values[1])
                current.append((x, y))
            previous_control = None
        elif lowered == "h":
            while more_numbers():
                value = numbers(1)[0]
                x = x + value if relative else value
                current.append((x, y))
            previous_control = None
        elif lowered == "v":
            while more_numbers():
                value = numbers(1)[0]
                y = y + value if relative else value
                current.append((x, y))
            previous_control = None
        elif lowered in {"c", "s"}:
            count = 6 if lowered == "c" else 4
            while index + count <= len(tokens) and more_numbers():
                values = numbers(count)
                p0 = (x, y)
                if lowered == "c":
                    p1 = (x + values[0], y + values[1]) if relative else (values[0], values[1])
                    p2 = (x + values[2], y + values[3]) if relative else (values[2], values[3])
                    p3 = (x + values[4], y + values[5]) if relative else (values[4], values[5])
                else:
                    p1 = (2 * x - previous_control[0], 2 * y - previous_control[1]) if previous_control else p0
                    p2 = (x + values[0], y + values[1]) if relative else (values[0], values[1])
                    p3 = (x + values[2], y + values[3]) if relative else (values[2], values[3])
                current.extend(cubic(p0, p1, p2, p3))
                previous_control = p2
                x, y = p3
        elif lowered == "z":
            x, y = start_x, start_y
            current.append((x, y))
            rings.append(current)
            current = []
            previous_control = None
        else:
            raise SystemExit("unsupported SVG path command in " + WORDMARK_SOURCE.name)
        previous_command = command
    if current:
        rings.append(current)
    return [ring for ring in rings if len(ring) > 2]


def mark_path_data() -> str:
    """Return the single even-odd path carried by the canonical vector mark."""
    svg = MARK_VECTOR.read_text(encoding="utf-8")
    matches = re.findall(r'<path[^>]*\bd="([^"]+)"', svg)
    if len(matches) != 1:
        raise SystemExit(str(MARK_VECTOR) + " must contain exactly one <path>, found " + str(len(matches)))
    return matches[0]


def wordmark_paths() -> list[str]:
    """Return the distributor lockup's letter path data (the tile art is excluded)."""
    svg = WORDMARK_SOURCE.read_text(encoding="utf-8")
    letters: list[str] = []
    for d in re.findall(r'\bd="([^"]+)"', svg):
        rings = path_rings(d)
        if not rings:
            continue
        min_x = min(point[0] for ring in rings for point in ring)
        max_x = max(point[0] for ring in rings for point in ring)
        # A ring set that spans half the canvas is the tile; letters are narrower and
        # always start to the right of it.
        if max_x - min_x >= LOCKUP_VIEW[2] * 0.5 or min_x < LETTER_MIN_X:
            continue
        letters.append(d)
    if len(letters) < 6:
        raise SystemExit("expected the BP Office wordmark letters in " + WORDMARK_SOURCE.name + ", found " + str(len(letters)))
    return letters


def render_master() -> Image.Image:
    image = Image.open(MASTER_ICON).convert("RGBA")
    if image.size != (ICON_SIZE, ICON_SIZE):
        raise SystemExit(str(MASTER_ICON) + " must be 1024x1024, found " + str(image.size[0]) + "x" + str(image.size[1]))
    return image


def write_lockup() -> None:
    view = "%g %g %g %g" % LOCKUP_VIEW
    mark_scale = MARK_BOX / MARK_VIEW_BOX
    lines = [
        '<svg width="1050" height="240" viewBox="' + view + '" xmlns="http://www.w3.org/2000/svg" '
        'role="img" aria-labelledby="bpoffice-title">',
        '  <title id="bpoffice-title">BP Office</title>',
        '  <g fill="currentColor">',
        '    <path transform="scale(' + ("%g" % mark_scale) + ')" fill-rule="evenodd" d="' + mark_path_data() + '"/>',
    ]
    for d in wordmark_paths():
        lines.append('    <path fill-rule="evenodd" d="' + d.strip().replace("\n", " ") + '"/>')
    lines.append("  </g>")
    lines.append("</svg>")
    (RENDERER_ASSETS / "bpoffice-logo.svg").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def write_mark_svg() -> None:
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + str(MARK_VIEW_BOX) + " " + str(MARK_VIEW_BOX) + '" '
        'role="img" aria-labelledby="bpoffice-mark-title">\n'
        '  <title id="bpoffice-mark-title">BP Office</title>\n'
        '  <path fill="currentColor" fill-rule="evenodd" d="' + mark_path_data() + '"/>\n'
        "</svg>\n"
    )
    (BUILD_DIR / "bpoffice-mark.svg").write_text(svg, encoding="utf-8", newline="\n")


def main() -> None:
    icon = render_master()

    mac_icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    core = icon.resize((ICON_SIZE - MAC_INSET * 2, ICON_SIZE - MAC_INSET * 2), Image.Resampling.LANCZOS)
    mac_icon.alpha_composite(core, (MAC_INSET, MAC_INSET))

    icon.save(BUILD_DIR / "icon.png", optimize=True)
    mac_icon.save(BUILD_DIR / "icon-mac.png", optimize=True)
    icon.save(BUILD_DIR / "icon.ico", format="ICO", sizes=ICO_SIZES)
    mac_icon.save(BUILD_DIR / "icon.icns", format="ICNS")
    icon.save(BUILD_DIR / "bpoffice-mark.png", optimize=True)
    icon.save(RENDERER_ASSETS / "app-icon.png", optimize=True)

    icons_dir = BUILD_DIR / "icons"
    icons_dir.mkdir(exist_ok=True)
    for size in LINUX_ICON_SIZES:
        icon.resize((size, size), Image.Resampling.LANCZOS).save(icons_dir / (str(size) + "x" + str(size) + ".png"), optimize=True)

    write_lockup()
    write_mark_svg()
    print("BP Office brand assets written under apps/shell/build and apps/shell/src/renderer/src/assets")


if __name__ == "__main__":
    main()
