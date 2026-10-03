from pathlib import Path
import io
import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

def render(source: Path, output: Path, size: int) -> None:
    png = cairosvg.svg2png(
        url=str(source),
        output_width=size,
        output_height=size,
    )
    image = Image.open(io.BytesIO(png)).convert('RGB')
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, 'PNG', optimize=True)

icon_source = ROOT / 'store-assets' / 'quiz-arena-app-icon.svg'
splash_source = ROOT / 'store-assets' / 'quiz-arena-splash.svg'

render(
    icon_source,
    ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png',
    1024,
)

for name in (
    'splash-2732x2732.png',
    'splash-2732x2732-1.png',
    'splash-2732x2732-2.png',
):
    render(
        splash_source,
        ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'Splash.imageset' / name,
        2732,
    )

icon = Image.open(ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png')
assert icon.size == (1024, 1024)
assert icon.mode == 'RGB'
print('Quiz Arena iOS store assets generated successfully.')
