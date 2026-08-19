"""Generate the BP-Office installer icons and shell lockup deterministically.

Requires Pillow. The geometry is the same black rounded-square/white company logo
used by the editor ``BPOfficeMark`` components.
"""

from pathlib import Path

from PIL import Image, ImageDraw


BUILD_DIR = Path(__file__).resolve().parent
SHELL_DIR = BUILD_DIR.parent
RENDERER_ASSETS = SHELL_DIR / "src" / "renderer" / "src" / "assets"
ICON_SIZE = 1024
SUPERSAMPLE = 4
B_PATH = (
    (6, 18),
    (6, 6),
    (8, 6),
    (13, 11),
    (13, 6),
    (15, 6),
    (15, 18),
    (13, 18),
    (8, 13),
    (8, 18),
    (6, 18),
)


def make_mark(inset: int) -> Image.Image:
    scale = SUPERSAMPLE
    canvas = Image.new("RGBA", (ICON_SIZE * scale, ICON_SIZE * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    left = inset * scale
    top = inset * scale
    side = (ICON_SIZE - inset * 2) * scale
    draw.rounded_rectangle(
        (left, top, left + side, top + side),
        radius=side * 0.25,
        fill=(0, 0, 0, 255),
    )
    points = [
        (left + x / 24 * side, top + y / 24 * side)
        for x, y in B_PATH
    ]
    draw.polygon(points, fill=(255, 255, 255, 255))
    return canvas.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS)


def write_lockup() -> None:
    lockup = """<svg width="1091" height="240" viewBox="0 0 1091 240" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="bpoffice-title">
  <title id="bpoffice-title">BP-Office</title>
  <rect width="240" height="240" rx="60" fill="black"/>
  <path d="M65 170V70H89L151 136V70H175V170H153L89 102V170H65Z" fill="white"/>
  <text x="280" y="183" fill="black" font-family="Inter, Arial, Helvetica, sans-serif" font-size="176" font-weight="700" letter-spacing="-5">BP-Office</text>
</svg>
"""
    with (RENDERER_ASSETS / "genoffice-logo.svg").open(
        "w", encoding="utf-8", newline="\n"
    ) as output:
        output.write(lockup)


def main() -> None:
    mark = make_mark(inset=32)
    mac_mark = make_mark(inset=150)

    mark.save(BUILD_DIR / "icon.png", optimize=True)
    mac_mark.save(BUILD_DIR / "icon-mac.png", optimize=True)
    mark.save(RENDERER_ASSETS / "app-icon.png", optimize=True)
    mark.save(
        BUILD_DIR / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    mac_mark.save(BUILD_DIR / "icon.icns", format="ICNS")
    write_lockup()


if __name__ == "__main__":
    main()
