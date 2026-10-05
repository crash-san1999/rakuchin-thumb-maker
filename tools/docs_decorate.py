"""説明書（docs/img）の画像を、ポップでかわいい見た目にする仕上げ処理。
   撮ったままの画面（スクリーンショット）に、パステルの水玉の背景・丸い角・アプリと同じ太い縁とずらした影・ステッカー風の見出し・
   きらきらやハートの飾りを付ける。撮影は tools/docs-screenshots.py、ここはその仕上げだけ（画像の中身は変えない）。
   フォントは同梱の「にくまるフォント」（fonts/nikumaru）。Pillow が必要。"""
import hashlib, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'fonts' / 'nikumaru' / 'Nikumaru.otf'
INK = (31, 27, 45)          # アプリの縁の色（#1f1b2d）
SS = 3                      # 縁・飾り・文字は 3 倍で描いてから縮める（ギザギザを消すため）

# 背景の配色：(地の色, 水玉の色, 影・ステッカーの色)。画像の名前から決めるので、撮り直しても同じ色になる
THEMES = [
    ('#ffe9dc', '#ffd3bb', '#ff8a5c'),   # もも
    ('#dff7ec', '#bdeed7', '#2fc08e'),   # ミント
    ('#ece4ff', '#d9ccff', '#8a66ff'),   # ラベンダー
    ('#fff6c9', '#ffeb92', '#ffb000'),   # レモン
    ('#dff1ff', '#bfe3ff', '#2f9bff'),   # そら
    ('#ffe0ec', '#ffc5da', '#ff4f8b'),   # さくら
]
# 見出し（ステッカー）。ここにない名前は見出しなし
LABELS = {
    'overview': '全体画面', 'help': 'かんたん操作ガイド', 'add-menu': '追加メニュー', 'dragdrop': 'ドラッグ＆ドロップ',
    'ins-bg': '背景タブ', 'ins-bg-tone': '色調タブ', 'bg-effects': '効果タブ', 'ins-text': 'テキストタブ', 'tab-style': 'スタイルタブ',
    'tab-design': '装飾タブ', 'tab-font': 'フォントタブ', 'ins-image': '配置タブ', 'ins-frame': 'フレームタブ', 'ins-edge': 'フチ・影タブ',
    'frames-pop': 'かわいい・ポップ', 'frames-cool': 'カッコいい', 'frames-game': 'ゲーム・配信', 'frames-brush': 'ブラシ・手作り感', 'frames-retro': 'レトロ・アート',
    'frame-edit': 'フレーム調整モード', 'collage': '分割フレーム', 'ins-cells': 'マスの画像', 'collage-fx': '分割フレームの効果', 'fx-layer': '動的エフェクト',
    'layers': 'レイヤー', 'file-menu': 'ファイルメニュー', 'text-mode': '文字素材モード',
    'mobile': 'スマホ画面', 'mobile-add': '追加', 'mobile-ins': '設定', 'mobile-layers': 'レイヤー',
    'fx-manga': 'マンガの表現', 'fx-light': '光のエフェクト', 'fx-stage': '演出のエフェクト', 'fx-game': 'ゲーム・配信', 'imgfx': '画像の加工', 'imgfx-warp': 'ゆがみ', 'fin-looks': '新しい仕上げ',
    'week': '1週間の予定表', 'ins-ctext': '背景色・文字タブ', 'new-project': '新規作成',
}
# 下に余白が大きく空く縦長のパネル画像は、中身のところまでで切る
TRIM = ('ins-', 'tab-', 'bg-effects')

def _rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def _layer(w, h, draw_fn):
    """3 倍の大きさの透明な紙に draw_fn(ImageDraw, 倍率) で描き、元の大きさに縮めて返す（なめらかな縁になる）"""
    im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(im), SS)
    return im.resize((w, h), Image.LANCZOS)

def _sparkle(d, cx, cy, r, fill, s):      # 4 つの角のきらきら
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2; rr = r if i % 2 == 0 else r * 0.36
        pts.append((cx + math.cos(a) * rr * s, cy + math.sin(a) * rr * s))
    d.polygon(pts, fill=fill)

def _heart(d, cx, cy, r, fill, s):
    d.ellipse([cx - r * s, cy - r * 0.9 * s, cx, cy + r * 0.1 * s], fill=fill); d.ellipse([cx, cy - r * 0.9 * s, cx + r * s, cy + r * 0.1 * s], fill=fill)
    d.polygon([(cx - r * 0.97 * s, cy - r * 0.18 * s), (cx + r * 0.97 * s, cy - r * 0.18 * s), (cx, cy + r * 1.05 * s)], fill=fill)

def _star(d, cx, cy, r, fill, s):         # 5 つの角の星
    pts = []
    for i in range(10):
        a = math.pi / 5 * i - math.pi / 2; rr = r if i % 2 == 0 else r * 0.46
        pts.append((cx + math.cos(a) * rr * s, cy + math.sin(a) * rr * s))
    d.polygon(pts, fill=fill)

def _trim_bottom(im, pad=26):
    """パネルの下の余白（背景と同じ色が続く部分）を切る"""
    rgb = im.convert('RGB'); w, h = rgb.size; bg = rgb.getpixel((w // 2, h - 2))
    near = lambda p: abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) < 18
    y = h - 1
    while y > 0 and all(near(rgb.getpixel((x, y))) for x in range(8, w - 8, 3)): y -= 1
    return im.crop((0, 0, w, min(h, y + pad)))

def decorate(src, name):
    """src（撮ったままの画像）を、ポップな飾り付きの画像にして返す。name は 'overview' のような拡張子なしの名前"""
    shot = Image.open(src).convert('RGBA')
    if name.startswith(TRIM): shot = _trim_bottom(shot)
    sw, sh = shot.size
    big = sw >= 1000
    pad = 44 if big else 34
    seed = int(hashlib.md5(name.encode()).hexdigest(), 16)
    base, dot, acc = (_rgb(c) for c in THEMES[seed % len(THEMES)]); rnd = random.Random(seed)
    label = LABELS.get(name); sticker = None
    if label:
        fs = 34 if big else 28; font = ImageFont.truetype(str(FONT), fs * SS)
        tw = int(ImageDraw.Draw(Image.new('L', (1, 1))).textlength(label, font=font)) // SS
        cw, ch = tw + 52, fs + 24
        def chip(d, s):
            d.rounded_rectangle([5 * s + 5 * s, 5 * s + 5 * s, (cw + 5) * s + 5 * s, (ch + 5) * s + 5 * s], ch * s // 2, fill=INK + (255,))        # 影
            d.rounded_rectangle([5 * s, 5 * s, (cw + 5) * s, (ch + 5) * s], ch * s // 2, fill=acc + (255,), outline=INK + (255,), width=4 * s)
            d.text(((cw + 10) * s / 2, (ch + 10) * s / 2 + 1 * s), label, font=font, fill=(255, 255, 255, 255), anchor='mm', stroke_width=2 * s, stroke_fill=INK + (255,))
            _sparkle(d, 20 * s, 14 * s, 8 * s, (255, 255, 255, 255), 1)
        sticker = _layer(cw + 20, ch + 20, chip).rotate(3.5, resample=Image.BICUBIC, expand=True)
    top = (sticker.height - 2) if sticker is not None else pad
    W, H = sw + pad * 2, sh + top + pad
    # 1) 背景：地の色 + 水玉（ななめに並べる）
    bg = Image.new('RGBA', (W, H), base + (255,))
    def dots(d, s):
        gap = 34
        for r_i, y in enumerate(range(-gap, H + gap, gap)):
            for x in range(-gap, W + gap, gap * 2):
                cx = x + (gap if r_i % 2 else 0); d.ellipse([(cx - 5) * s, (y - 5) * s, (cx + 5) * s, (y + 5) * s], fill=dot + (255,))
    bg.alpha_composite(_layer(W, H, dots))
    # 2) 飾り：きらきら・星・ハート・丸を、縁の余白だけに散らす（画面にはかぶせない）
    def deco(d, s):
        spots = []
        for _ in range(60):
            side = rnd.choice('tblr')
            x = rnd.uniform(8, W - 8) if side in 'tb' else (rnd.uniform(6, pad - 8) if side == 'l' else rnd.uniform(W - pad + 8, W - 6))
            y = rnd.uniform(top - 18, H - 8) if side in 'lr' else (rnd.uniform(6, top - 12) if side == 't' else rnd.uniform(H - pad + 8, H - 6))
            r = rnd.uniform(7, 13)
            if all(math.hypot(x - a, y - b) > 44 for a, b, _ in spots): spots.append((x, y, r))
            if len(spots) >= (9 if big else 6): break
        for i, (x, y, r) in enumerate(spots):
            kind = i % 4; col = acc + (255,) if i % 2 == 0 else (255, 255, 255, 255)
            if kind == 0: _sparkle(d, x * s, y * s, r * 1.5 * s, col, 1)
            elif kind == 1: _heart(d, x * s, y * s, r * 0.95 * s, col, 1)
            elif kind == 2: _star(d, x * s, y * s, r * 1.3 * s, col, 1)
            else: d.ellipse([(x - r * 0.6) * s, (y - r * 0.6) * s, (x + r * 0.6) * s, (y + r * 0.6) * s], outline=col, width=int(3 * s))
    bg.alpha_composite(_layer(W, H, deco))
    # 3) ずらした影 → 画面（角を丸く）→ 太い縁
    rad = 22 if big else 16; ox, oy = pad, top
    off = 8 if big else 6
    bg.alpha_composite(_layer(W, H, lambda d, s: d.rounded_rectangle([(ox + off) * s, (oy + off) * s, (ox + sw + off) * s, (oy + sh + off) * s], rad * s, fill=INK + (255,))))
    mask = _layer(sw, sh, lambda d, s: d.rounded_rectangle([0, 0, sw * s - 1, sh * s - 1], rad * s, fill=(255, 255, 255, 255)))
    clipped = Image.new('RGBA', (sw, sh), (0, 0, 0, 0)); clipped.paste(shot, (0, 0), mask.split()[3])
    bg.alpha_composite(clipped, (ox, oy))
    lw = 4
    bg.alpha_composite(_layer(W, H, lambda d, s: d.rounded_rectangle([ox * s, oy * s, (ox + sw) * s - 1, (oy + sh) * s - 1], rad * s, outline=INK + (255,), width=lw * s)))
    # 4) 見出しのステッカー：左上に、少し傾けて重ねる
    if sticker is not None: bg.alpha_composite(sticker, (max(4, ox - 8), 6))
    return bg.convert('RGB')

def decorate_file(raw, out):
    """raw（撮ったまま）を飾って out に保存する。保存名の拡張子を除いた部分が、見出しや配色の決め手になる"""
    name = Path(out).stem
    decorate(raw, name).save(out, optimize=True)
