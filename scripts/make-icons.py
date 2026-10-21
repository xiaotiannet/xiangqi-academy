"""生成安卓启动图标：象牙底 + 朱红棋子圈 + 「帅」字。"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'res')
BASE = 512

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\msyhbd.ttc',
    r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\simhei.ttf',
    r'C:\Windows\Fonts\simsun.ttc',
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def render():
    img = Image.new('RGBA', (BASE, BASE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 底：暖象牙色，带一层很浅的径向渐变
    for i in range(BASE // 2, 0, -1):
        t = i / (BASE / 2)
        color = (
            int(255 - t * 10),
            int(250 - t * 14),
            int(238 - t * 24),
            255,
        )
        d.ellipse([BASE / 2 - i, BASE / 2 - i, BASE / 2 + i, BASE / 2 + i], fill=color)

    # 朱红棋子外圈
    ring = BASE * 0.40
    gap = BASE * 0.035
    d.ellipse(
        [BASE / 2 - ring, BASE / 2 - ring, BASE / 2 + ring, BASE / 2 + ring],
        outline=(182, 38, 30, 255),
        width=int(BASE * 0.045),
    )
    inner = ring - gap
    d.ellipse(
        [BASE / 2 - inner, BASE / 2 - inner, BASE / 2 + inner, BASE / 2 + inner],
        outline=(214, 52, 44, 255),
        width=int(BASE * 0.014),
    )

    # 「帅」
    font = load_font(int(BASE * 0.46))
    text = '帅'
    box = d.textbbox((0, 0), text, font=font)
    w = box[2] - box[0]
    h = box[3] - box[1]
    d.text(
        ((BASE - w) / 2 - box[0], (BASE - h) / 2 - box[1] - BASE * 0.012),
        text,
        font=font,
        fill=(182, 38, 30, 255),
    )
    return img


DENSITIES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

base = render()
for folder, size in DENSITIES.items():
    out_dir = os.path.join(RES, folder)
    os.makedirs(out_dir, exist_ok=True)
    base.resize((size, size), Image.LANCZOS).save(os.path.join(out_dir, 'ic_launcher.png'))
    print('icon ->', folder, size)
