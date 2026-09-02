#!/usr/bin/env python3
"""Trace the distributor raster master icon into the canonical BP Office vector mark.

One-off brand-conversion tool. ``branding/source/icon.png`` is a raster master, so the
vector mark that every themed UI surface consumes (``branding/bpoffice-mark.svg``) has
to be derived from it once and then committed: the day-to-day asset generator
(``apps/shell/build/generate-brand-assets.py``) only needs Pillow and reads the
committed SVG.

Requires Pillow, NumPy, SciPy and scikit-image (``pip install pillow numpy scipy
scikit-image``). Re-run after replacing ``branding/source/icon.png``:

    python tools/trace-brand-mark.py

The tool prints the raster/vector agreement it measured (intersection over union);
values around 0.98 are expected because the master carries anti-aliased edges.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
from skimage import measure

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ICON = REPO_ROOT / "branding" / "source" / "icon.png"
OUTPUT_SVG = REPO_ROOT / "branding" / "bpoffice-mark.svg"
# The same geometry is hardcoded by the shared React icon in packages/ui, so the tracer
# refreshes both copies and apps/shell/tests/brand-assets.test.ts proves they agree.
OUTPUT_UI_MODULE = REPO_ROOT / "packages" / "ui" / "src" / "brand-mark.ts"

INK_LUMINANCE = 140  # the master is monochrome: dark pixels are ink, light ones are paper
SMOOTH_SIGMA = 1.0  # rounds the pixel staircase before contour extraction
SIMPLIFY_TOLERANCE = 0.5
MIN_RING_POINTS = 8
VIEW_BOX = 1024


def ink_mask(path: Path) -> np.ndarray:
    """Return the opaque dark-pixel mask of the master icon."""
    image = Image.open(path).convert("RGBA")
    if image.size != (VIEW_BOX, VIEW_BOX):
        raise SystemExit(f"{path} must be {VIEW_BOX}x{VIEW_BOX}, found {image.size[0]}x{image.size[1]}")
    channels = np.asarray(image).astype(np.int32)
    opaque = channels[..., 3] > 127
    luminance = (channels[..., 0] * 299 + channels[..., 1] * 587 + channels[..., 2] * 114) // 1000
    return opaque & (luminance < INK_LUMINANCE)


def trace_rings(mask: np.ndarray) -> list[np.ndarray]:
    """Extract simplified closed contours: the outer shape plus every negative-space hole."""
    blurred = gaussian_filter(mask.astype(np.float32), SMOOTH_SIGMA)
    rings: list[np.ndarray] = []
    for contour in measure.find_contours(blurred, 0.5):
        if len(contour) < MIN_RING_POINTS:
            continue
        simplified = measure.approximate_polygon(contour, SIMPLIFY_TOLERANCE)
        if len(simplified) >= 3:
            rings.append(simplified)
    if not rings:
        raise SystemExit("tracing produced no contours - is the master icon blank?")
    return rings


def path_data(rings: list[np.ndarray]) -> str:
    """Serialize (row, col) rings as even-odd SVG path data in x/y space."""
    parts: list[str] = []
    for ring in rings:
        body = " ".join(f"{round(float(col), 2)} {round(float(row), 2)}" for row, col in ring)
        parts.append(f"M{body}Z")
    return "".join(parts)


def agreement(mask: np.ndarray, rings: list[np.ndarray]) -> float:
    """Intersection over union between the master mask and the traced even-odd fill."""
    raster = np.zeros(mask.shape, dtype=bool)
    for ring in rings:
        polygon = [(float(col), float(row)) for row, col in ring]
        single = Image.new("L", (VIEW_BOX, VIEW_BOX), 0)
        ImageDraw.Draw(single).polygon(polygon, fill=255)
        raster ^= np.asarray(single) > 127
    union = np.logical_or(raster, mask).sum()
    return float(np.logical_and(raster, mask).sum() / union) if union else 0.0


def main() -> int:
    mask = ink_mask(SOURCE_ICON)
    rings = trace_rings(mask)
    score = agreement(mask, rings)
    data = path_data(rings)
    OUTPUT_SVG.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_BOX} {VIEW_BOX}" role="img" '
        'aria-labelledby="bpoffice-mark-title">\n'
        '  <title id="bpoffice-mark-title">BP Office</title>\n'
        f'  <path fill="currentColor" fill-rule="evenodd" d="{data}"/>\n'
        "</svg>\n",
        encoding="utf-8",
        newline="\n",
    )
    OUTPUT_UI_MODULE.write_text(
        "/**\n"
        " * BP Office mark geometry, traced from branding/source/icon.png by\n"
        " * tools/trace-brand-mark.py. Do not hand edit: regenerate so this constant,\n"
        " * branding/bpoffice-mark.svg and apps/shell/build/bpoffice-mark.svg stay equal.\n"
        " */\n"
        'export const BP_OFFICE_MARK_VIEW_BOX = "0 0 %d %d"\n' % (VIEW_BOX, VIEW_BOX)
        + '\nexport const BP_OFFICE_MARK_PATH =\n    "%s"\n' % data,
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"wrote {OUTPUT_SVG.relative_to(REPO_ROOT).as_posix()} and "
        f"{OUTPUT_UI_MODULE.relative_to(REPO_ROOT).as_posix()}: "
        f"{len(rings)} rings, {sum(len(r) for r in rings)} points, raster agreement {score:.4f}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
