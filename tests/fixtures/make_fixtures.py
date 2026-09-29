"""テスト用の画像を作る（すべてこのスクリプトで描いたオリジナル。リポジトリには画像を入れない）"""
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent

def city(p):  # 夜の街（背景用）
    random.seed(1); W, H = 1600, 900
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H): t = y / H; d.line([(0, y), (W, y)], fill=(int(40 + 60 * t), int(70 + 90 * t), int(150 - 40 * t)))
    d.ellipse((1080, 90, 1300, 310), fill=(255, 214, 110))
    x = 0
    while x < W:
        w = random.randint(70, 170); h = random.randint(260, 640); c = random.randint(40, 70)
        d.rectangle((x, H - h, x + w, H), fill=(c, c + 8, c + 30))
        for wy in range(H - h + 20, H - 20, 34):
            for wx in range(x + 12, x + w - 16, 26):
                if random.random() < 0.55: d.rectangle((wx, wy, wx + 12, wy + 16), fill=(255, 226, 120))
        x += w + random.randint(4, 20)
    d.rectangle((0, H - 60, W, H), fill=(120, 160, 90))
    im.save(p, quality=90)

def chara(p):  # キャラ風の立ち絵（画像レイヤー用）
    im = Image.new('RGB', (900, 1200), (120, 170, 230)); d = ImageDraw.Draw(im)
    for i in range(12): d.ellipse((100 + i * 20, 200 + i * 30, 800 - i * 20, 1100 - i * 25), fill=(255 - i * 15, 180 + i * 5, 120 + i * 10))
    d.ellipse((330, 300, 570, 540), fill=(250, 220, 190)); d.rectangle((250, 560, 650, 1100), fill=(240, 90, 120))
    im.save(p, quality=90)

def synth(p):  # 夕焼けのレトロなグリッド風景
    W, H = 1200, 900; im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H // 2): t = y / (H / 2); d.line([(0, y), (W, y)], fill=(int(40 + 200 * t), int(20 + 60 * t), int(90 + 40 * (1 - t))))
    sun = Image.new('L', (W, H), 0); sd = ImageDraw.Draw(sun); sd.ellipse((W / 2 - 190, H / 2 - 300, W / 2 + 190, H / 2 + 80), fill=255)
    for i in range(7): sd.rectangle((0, H / 2 - 120 + i * 28, W, H / 2 - 120 + i * 28 + 6 + i * 2), fill=0)
    im.paste(Image.new('RGB', (W, H), (255, 180, 70)), (0, 0), sun); d = ImageDraw.Draw(im)
    d.rectangle((0, H // 2, W, H), fill=(30, 10, 50))
    for i in range(-20, 21): d.line([(W / 2, H / 2), (W / 2 + i * 140, H)], fill=(255, 70, 200), width=3)
    y, k = H / 2, 6
    while y < H: d.line([(0, y), (W, y)], fill=(255, 70, 200), width=2); y += k; k *= 1.35
    im.save(p, quality=90)

def night(p):  # 星空と山
    random.seed(4); W, H = 1200, 900; im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H): t = y / H; d.line([(0, y), (W, y)], fill=(int(10 + 30 * t), int(15 + 40 * t), int(50 + 90 * t)))
    for _ in range(420):
        x, y = random.randrange(W), random.randrange(int(H * 0.7)); r = random.choice([1, 1, 2, 3]); c = random.randint(170, 255)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(c, c, 255))
    d.ellipse((860, 120, 980, 240), fill=(255, 244, 200))
    d.polygon([(0, H), (0, 620), (220, 420), (380, 560), (560, 330), (760, 580), (930, 450), (1200, 640), (1200, H)], fill=(28, 40, 80))
    im.filter(ImageFilter.SMOOTH).save(p, quality=90)

def rings(p, a, b, n):  # 同心円（分割フレームのマス用）
    im = Image.new('RGB', (800, 800), a); d = ImageDraw.Draw(im)
    for r in range(8): d.ellipse((100 + r * 30, 100 + r * 30, 700 - r * 30, 700 - r * 30), outline=b, width=12)
    d.text((380, 380), str(n), fill=(0, 0, 0)); im.save(p, quality=90)

MAKERS = {'city.jpg': city, 'chara.jpg': chara, 'synth.jpg': synth, 'night.jpg': night,
          'rings4.jpg': lambda p: rings(p, (255, 120, 120), (255, 220, 120), 4),
          'rings5.jpg': lambda p: rings(p, (120, 200, 255), (40, 60, 140), 5),
          'rings6.jpg': lambda p: rings(p, (140, 230, 140), (20, 90, 40), 6)}

def ensure():
    for name, fn in MAKERS.items():
        path = HERE / name
        if not path.exists(): fn(path)
    return HERE

if __name__ == '__main__':
    print(ensure())
