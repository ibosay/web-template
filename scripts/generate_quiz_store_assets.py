from pathlib import Path
import io
import re

import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def svg_to_image(source: Path, width: int, height: int, mode: str = 'RGB') -> Image.Image:
    png = cairosvg.svg2png(
        url=str(source),
        output_width=width,
        output_height=height,
    )
    return Image.open(io.BytesIO(png)).convert(mode)


def svg_text_to_image(svg_text: str, width: int, height: int, mode: str = 'RGBA') -> Image.Image:
    png = cairosvg.svg2png(
        bytestring=svg_text.encode('utf-8'),
        output_width=width,
        output_height=height,
    )
    return Image.open(io.BytesIO(png)).convert(mode)


def save_image(image: Image.Image, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, 'PNG', optimize=True)


def render_square(source: Path, output: Path, size: int) -> None:
    save_image(svg_to_image(source, size, size, 'RGB'), output)


def render_round(source: Path, output: Path, size: int) -> None:
    image = svg_to_image(source, size, size, 'RGBA')
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    image.putalpha(mask)
    save_image(image, output)


def render_center_crop(source: Path, output: Path, width: int, height: int) -> None:
    base_size = max(width, height)
    image = svg_to_image(source, base_size, base_size, 'RGB')
    left = (base_size - width) // 2
    top = (base_size - height) // 2
    cropped = image.crop((left, top, left + width, top + height))
    save_image(cropped, output)


icon_source = ROOT / 'store-assets' / 'quiz-arena-app-icon.svg'
splash_source = ROOT / 'store-assets' / 'quiz-arena-splash.svg'

render_square(
    icon_source,
    ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png',
    1024,
)

for name in (
    'splash-2732x2732.png',
    'splash-2732x2732-1.png',
    'splash-2732x2732-2.png',
):
    render_square(
        splash_source,
        ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'Splash.imageset' / name,
        2732,
    )

android_icon_sizes = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}

android_foreground_sizes = {
    'mdpi': 108,
    'hdpi': 162,
    'xhdpi': 216,
    'xxhdpi': 324,
    'xxxhdpi': 432,
}

icon_svg_text = icon_source.read_text(encoding='utf-8')
foreground_svg_text = re.sub(
    r'\s*<rect width="1024" height="1024" fill="url\(#bg\)"/>\s*',
    '\n',
    icon_svg_text,
    count=1,
)

for density, size in android_icon_sizes.items():
    directory = ROOT / 'android' / 'app' / 'src' / 'main' / 'res' / f'mipmap-{density}'
    render_square(icon_source, directory / 'ic_launcher.png', size)
    render_round(icon_source, directory / 'ic_launcher_round.png', size)

for density, size in android_foreground_sizes.items():
    directory = ROOT / 'android' / 'app' / 'src' / 'main' / 'res' / f'mipmap-{density}'
    save_image(
        svg_text_to_image(foreground_svg_text, size, size, 'RGBA'),
        directory / 'ic_launcher_foreground.png',
    )

android_splash_sizes = {
    'drawable/splash.png': (480, 320),
    'drawable-port-mdpi/splash.png': (320, 480),
    'drawable-port-hdpi/splash.png': (480, 800),
    'drawable-port-xhdpi/splash.png': (720, 1280),
    'drawable-port-xxhdpi/splash.png': (960, 1600),
    'drawable-port-xxxhdpi/splash.png': (1280, 1920),
    'drawable-land-mdpi/splash.png': (480, 320),
    'drawable-land-hdpi/splash.png': (800, 480),
    'drawable-land-xhdpi/splash.png': (1280, 720),
    'drawable-land-xxhdpi/splash.png': (1600, 960),
    'drawable-land-xxxhdpi/splash.png': (1920, 1280),
}

for relative_path, (width, height) in android_splash_sizes.items():
    render_center_crop(
        splash_source,
        ROOT / 'android' / 'app' / 'src' / 'main' / 'res' / relative_path,
        width,
        height,
    )

icon = Image.open(ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png')
assert icon.size == (1024, 1024)
assert icon.mode == 'RGB'

android_icon = Image.open(ROOT / 'android' / 'app' / 'src' / 'main' / 'res' / 'mipmap-xxxhdpi' / 'ic_launcher.png')
assert android_icon.size == (192, 192)

print('Quiz Arena iOS and Android store assets generated successfully.')
