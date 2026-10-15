"""
Builds the email-sized artwork in backend/assets/email/ from the landing-page
art in frontend/src/assets/.

The source art is 1-4 MB per file, far too heavy for an email, so each image is
cropped to its subject, composited onto the email background colour where it
needs to be opaque, and resized to twice its display size (sharp on retina).

Only re-run this when the landing-page art changes:

    python backend/scripts/build-email-assets.py

Requires Pillow (pip install pillow). The generated files are committed, so the
backend itself never needs Python or Pillow at runtime.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "src" / "assets"
TARGET = ROOT / "backend" / "assets" / "email"

# Must match EMAIL_BACKGROUND in backend/services/emailTemplates/arcadiaLayout.js.
BACKGROUND = (11, 3, 22)


def load(name):
    return Image.open(SOURCE / name).convert("RGBA")


def flatten(image):
    canvas = Image.new("RGB", image.size, BACKGROUND)
    canvas.paste(image, mask=image.getchannel("A"))
    return canvas


def fade_bottom(image, fraction):
    """Blends the bottom edge into the background so the hero has no hard seam."""
    width, height = image.size
    start = int(height * (1 - fraction))
    overlay = Image.new("RGB", image.size, BACKGROUND)
    mask = Image.new("L", image.size, 0)
    for y in range(start, height):
        mask.paste(int(255 * (y - start) / (height - start)), (0, y, width, y + 1))
    return Image.composite(overlay, image, mask)


def resize_to_width(image, width):
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.LANCZOS)


def save_jpeg(image, name):
    path = TARGET / name
    image.save(path, "JPEG", quality=78, optimize=True, progressive=True)
    return path


def save_png(image, name):
    path = TARGET / name
    image.save(path, "PNG", optimize=True)
    return path


def build():
    TARGET.mkdir(parents=True, exist_ok=True)
    written = []

    # Header mark: the navbar "A" app icon, shown at 48px.
    logo = load("ArcadialogoA.png")
    logo = logo.crop(logo.getchannel("A").getbbox())
    written.append(save_png(logo.resize((96, 96), Image.LANCZOS), "logo.png"))

    # Welcome hero: the floating, reaching character from the landing hero.
    hero = flatten(load("ArcadionFull.png")).crop((560, 0, 3960, 2305))
    hero = fade_bottom(resize_to_width(hero, 1200), 0.22)
    written.append(save_jpeg(hero, "hero-welcome.jpg"))

    # Welcome-back hero: the same character at rest, from the landing CTA.
    rest = flatten(load("ArcadionCTA.png"))
    rest = fade_bottom(resize_to_width(rest, 1200), 0.18)
    written.append(save_jpeg(rest, "hero-welcome-back.jpg"))

    # Floating cube beside the call to action; keeps its transparency.
    cube = load("Arcadioncube.png")
    cube = cube.crop(cube.getchannel("A").getbbox())
    written.append(save_png(resize_to_width(cube, 176), "cube.png"))

    # Footer emblem: the Arcadion crest.
    crest = load("Arcadianlogo.png")
    crest = crest.crop(crest.getchannel("A").getbbox())
    written.append(save_png(resize_to_width(crest, 72), "crest.png"))

    for path in written:
        with Image.open(path) as image:
            print(f"{path.relative_to(ROOT)}  {image.size[0]}x{image.size[1]}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    build()
