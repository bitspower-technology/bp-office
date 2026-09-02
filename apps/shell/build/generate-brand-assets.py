"""Generate every shell-owned NiuOffice asset from the gradient-outline mark.

The canonical vector is ``branding/niuoffice-gradient-outline.svg``; the
shell-owned ``niuoffice-mark.svg`` is its accessible build copy. Their geometry
and gradient come from the user-supplied ``12-gradient-outline.svg``. The Windows/macOS
application icons use the mark on a dark rounded tile so the thin outline stays
legible at taskbar and installer sizes; the renderer lockup remains transparent.

Requires Pillow.  This script intentionally writes only ``apps/shell`` paths so
editor packages can consume the canonical SVG without cross-package mutations.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypeAlias

from PIL import Image, ImageChops, ImageDraw, ImageFilter


BUILD_DIR = Path(__file__).resolve().parent
SHELL_DIR = BUILD_DIR.parent
RENDERER_ASSETS = SHELL_DIR / "src" / "renderer" / "src" / "assets"
ICON_SIZE = 1024
SUPERSAMPLE = 4
MARK_WIDTH = 52.8412
MARK_HEIGHT = 33.6964
CYAN = (32, 218, 230, 255)
VIOLET = (128, 129, 229, 255)
PINK = (222, 34, 135, 255)
TILE = (16, 18, 24, 255)

Point: TypeAlias = tuple[float, float]
Command: TypeAlias = tuple[str, tuple[float, ...]]

# The Illustrator paths represented by the canonical SVG after normalizing its
# transforms.  They are used only for deterministic rasterization with Pillow.
MARK_PATHS: tuple[tuple[Command, ...], ...] = (
    (
        ("M", (38.507, 14.4414)),
        ("L", (28.879, 14.4414)),
        ("L", (28.879, 24.0684)),
        ("L", (13.879, 24.0684)),
        ("C", (11.54, 24.0684, 9.627, 22.1554, 9.627, 19.8164)),
        ("L", (9.627, 0.0004)),
        ("L", (0.0, 0.0004)),
        ("L", (0.0, 19.5224)),
        ("C", (0.0, 27.3174, 6.378, 33.6954, 14.173, 33.6954)),
        ("L", (28.879, 33.6954)),
        ("L", (28.879, 33.6964)),
        ("L", (38.507, 33.6964)),
        ("L", (38.507, 33.6954)),
        ("L", (38.508, 33.6954)),
        ("L", (38.508, 24.0684)),
        ("L", (38.507, 24.0684)),
        ("Z", ()),
    ),
    (
        ("M", (38.6682, 0.001)),
        ("L", (23.9612, 0.001)),
        ("L", (23.9612, 0.0)),
        ("L", (14.3342, 0.0)),
        ("L", (14.3342, 0.001)),
        ("L", (14.3332, 0.001)),
        ("L", (14.3332, 9.628)),
        ("L", (14.3342, 9.628)),
        ("L", (14.3342, 19.255)),
        ("L", (23.9612, 19.255)),
        ("L", (23.9612, 9.628)),
        ("L", (38.9622, 9.628)),
        ("C", (41.3002, 9.628, 43.2142, 11.541, 43.2142, 13.88)),
        ("L", (43.2142, 33.696)),
        ("L", (52.8412, 33.696)),
        ("L", (52.8412, 14.174)),
        ("C", (52.8412, 6.379, 46.4632, 0.001, 38.6682, 0.001)),
        ("Z", ()),
    ),
)


def _cubic_point(start: Point, values: tuple[float, ...], t: float) -> Point:
    a = (values[0], values[1])
    b = (values[2], values[3])
    end = (values[4], values[5])
    inv = 1.0 - t
    return (
        inv**3 * start[0] + 3 * inv**2 * t * a[0] + 3 * inv * t**2 * b[0] + t**3 * end[0],
        inv**3 * start[1] + 3 * inv**2 * t * a[1] + 3 * inv * t**2 * b[1] + t**3 * end[1],
    )


def flatten_path(commands: tuple[Command, ...]) -> list[Point]:
    points: list[Point] = []
    start: Point | None = None
    current: Point | None = None
    for command, values in commands:
        if command == "M":
            current = (values[0], values[1])
            start = current
            points.append(current)
        elif command == "L":
            current = (values[0], values[1])
            points.append(current)
        elif command == "C":
            if current is None:
                raise ValueError("Cubic segment must follow a move")
            for step in range(1, 65):
                points.append(_cubic_point(current, values, step / 64))
            current = (values[4], values[5])
        elif command == "Z" and start is not None:
            points.append(start)
    return points


def gradient(width: int, height: int) -> Image.Image:
    strip = Image.new("RGBA", (width, 1))
    pixels = strip.load()
    stops = ((0.0, CYAN), (0.5, VIOLET), (1.0, PINK))
    for x in range(width):
        position = x / max(1, width - 1)
        left, right = (stops[0], stops[1]) if position <= 0.5 else (stops[1], stops[2])
        span = right[0] - left[0]
        amount = 0.0 if span == 0 else (position - left[0]) / span
        pixels[x, 0] = tuple(round(left[1][i] + (right[1][i] - left[1][i]) * amount) for i in range(4))
    return strip.resize((width, height))


def render_outline(size: int, *, tile: bool) -> Image.Image:
    scale = SUPERSAMPLE
    canvas_size = size * scale
    highres_canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    if tile:
        inset = round(canvas_size * 0.035)
        ImageDraw.Draw(highres_canvas).rounded_rectangle(
            (inset, inset, canvas_size - inset, canvas_size - inset),
            radius=round(canvas_size * 0.23),
            fill=TILE,
        )

    mark_width = canvas_size * (0.76 if tile else 0.88)
    mark_scale = mark_width / MARK_WIDTH
    mark_height = MARK_HEIGHT * mark_scale
    left = (canvas_size - mark_width) / 2
    top = (canvas_size - mark_height) / 2
    highres_mask = Image.new("L", (canvas_size, canvas_size), 0)
    draw = ImageDraw.Draw(highres_mask)
    for path in MARK_PATHS:
        points = [(left + x * mark_scale, top + y * mark_scale) for x, y in flatten_path(path)]
        draw.polygon(points, fill=255)

    # Match the supplied SVG's clipped stroke: preserve only the inside edge of
    # each filled path, then color that edge with the horizontal signature gradient.
    # Erode after supersampled geometry is reduced to output size. This avoids
    # line-join spikes on the curved corners while keeping the operation fast.
    mask = highres_mask.resize((size, size), Image.Resampling.LANCZOS)
    stroke = max(2, round(size * (0.011 if tile else 0.009)))
    eroded = mask.filter(ImageFilter.MinFilter(stroke * 2 + 1))
    outline = ImageChops.subtract(mask, eroded)
    colored = gradient(size, size)
    canvas = highres_canvas.resize((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(Image.composite(colored, Image.new("RGBA", canvas.size), outline))
    return canvas


def write_lockup() -> None:
    # The renderer uses an <img>, so a signature-gradient wordmark keeps the
    # lockup readable in both light and dark themes without CSS color filters.
    lockup = """<svg width="1091" height="240" viewBox="0 0 1091 240" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="niuoffice-title">
  <title id="niuoffice-title">NiuOffice</title>
  <defs>
    <linearGradient id="brand" x1="12" y1="120" x2="1080" y2="120" gradientUnits="userSpaceOnUse">
      <stop stop-color="#20DAE6"/><stop offset=".5" stop-color="#8081E5"/><stop offset="1" stop-color="#DE2287"/>
    </linearGradient>
    <clipPath id="lowerClip"><path d="M38.507 14.4414H28.879V24.0684H13.879C11.54 24.0684 9.627 22.1554 9.627 19.8164V.0004H0V19.5224C0 27.3174 6.378 33.6954 14.173 33.6954H28.879V33.6964H38.507V33.6954H38.508V24.0684H38.507Z"/></clipPath>
    <clipPath id="upperClip"><path d="M38.6682 .001H23.9612V0H14.3342V.001H14.3332V9.628H14.3342V19.255H23.9612V9.628H38.9622C41.3002 9.628 43.2142 11.541 43.2142 13.88V33.696H52.8412V14.174C52.8412 6.379 46.4632 .001 38.6682 .001Z"/></clipPath>
  </defs>
  <g transform="translate(15 53.0424) scale(3.9742)" stroke="url(#brand)" stroke-width="1.4" fill="none">
    <g clip-path="url(#lowerClip)"><path d="M38.507 14.4414H28.879V24.0684H13.879C11.54 24.0684 9.627 22.1554 9.627 19.8164V.0004H0V19.5224C0 27.3174 6.378 33.6954 14.173 33.6954H28.879V33.6964H38.507V33.6954H38.508V24.0684H38.507Z"/></g>
    <g clip-path="url(#upperClip)"><path d="M38.6682 .001H23.9612V0H14.3342V.001H14.3332V9.628H14.3342V19.255H23.9612V9.628H38.9622C41.3002 9.628 43.2142 11.541 43.2142 13.88V33.696H52.8412V14.174C52.8412 6.379 46.4632 .001 38.6682 .001Z"/></g>
  </g>
  <text x="255" y="183" fill="url(#brand)" font-family="Inter, Arial, Helvetica, sans-serif" font-size="176" font-weight="700" letter-spacing="-5">NiuOffice</text>
</svg>
"""
    (RENDERER_ASSETS / "niuoffice-logo.svg").write_text(lockup, encoding="utf-8", newline="\n")


def main() -> None:
    icon = render_outline(ICON_SIZE, tile=True)
    mac_icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    mac_inset = 128
    mac_core = render_outline(ICON_SIZE - mac_inset * 2, tile=True)
    mac_icon.alpha_composite(mac_core, (mac_inset, mac_inset))
    transparent_mark = render_outline(ICON_SIZE, tile=False)

    icon.save(BUILD_DIR / "icon.png", optimize=True)
    mac_icon.save(BUILD_DIR / "icon-mac.png", optimize=True)
    icon.save(
        BUILD_DIR / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    mac_icon.save(BUILD_DIR / "icon.icns", format="ICNS")
    transparent_mark.save(BUILD_DIR / "niuoffice-mark.png", optimize=True)
    icon.save(RENDERER_ASSETS / "app-icon.png", optimize=True)

    icons_dir = BUILD_DIR / "icons"
    icons_dir.mkdir(exist_ok=True)
    for size in (16, 32, 48, 64, 128, 256, 512, 1024):
        icon.resize((size, size), Image.Resampling.LANCZOS).save(
            icons_dir / f"{size}x{size}.png", optimize=True
        )
    write_lockup()


if __name__ == "__main__":
    main()
