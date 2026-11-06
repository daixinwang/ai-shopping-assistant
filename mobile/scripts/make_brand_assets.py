"""生成「AI 购物助手」品牌素材：icon / adaptive-icon / splash / favicon（PNG）与 logo-mark.svg。

用法（仓库根目录）：
    .venv\\Scripts\\python.exe mobile\\scripts\\make_brand_assets.py

只依赖 Pillow；输出写入 mobile/assets/，重复运行会覆盖同名文件。
"""
from __future__ import annotations

import math
import os
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ── 品牌配色 ─────────────────────────────────────────────
INK = "#16181D"       # 收据黑
PAPER = "#F4F4F0"     # 小票纸白
TAG = "#FFD23F"       # 价签黄
GRAPHITE = "#5D626B"  # 次要文字

# ── 标志几何（100×100 设计坐标，y 轴向下）────────────────
TAG_POINTS = [(34, 24), (84, 24), (84, 76), (34, 76), (16, 50)]
TAG_CORNER_RADIUS = 7
HOLE_CENTER = (29, 50)
HOLE_RADIUS = 5.5
FINDER_CENTER = (59, 50)
FINDER_SIZE = 30          # 取景框四角所在方框的边长（线条中心线）
FINDER_ARM = 9
FINDER_STROKE = 5.5
DOT_RADIUS = 4
ROTATION_DEG = 10         # 绕 PIVOT 逆时针（左侧尖角略微朝下）
PIVOT = (50, 50)

# ── 渲染参数 ─────────────────────────────────────────────
SUPERSAMPLE = 4           # 先按 4 倍尺寸绘制，再用 LANCZOS 缩小
ARC_STEP_DEG = 0.5        # 圆弧折线化步长

# ── 各素材规格 ───────────────────────────────────────────
ICON_SIZE = 1024
ICON_MARK_WIDTH = 0.74            # 标志可见宽度 / 画面宽度
ADAPTIVE_SAFE_DIAMETER = 0.62     # 标志所有像素都落在直径为画面 62% 的中心圆内
FAVICON_SIZE = 48
FAVICON_FINDER_STROKE = 7     # 48px 下原线宽约 2.8px 偏糊，加粗到约 3.6px，角与角之间仍留约 2.6px 缝
FAVICON_DOT_RADIUS = 5

SPLASH_SIZE = (1284, 2778)
SPLASH_MARK_WIDTH = 300
SPLASH_TITLE = "AI 购物助手"
SPLASH_TITLE_SIZE = 76
SPLASH_TAGLINE = "拍一下 · 问一句 · 比一比"
SPLASH_TAGLINE_SIZE = 34
SPLASH_TAGLINE_TRACKING = 0.08    # em；在等宽网格之外再放宽的字距
SPLASH_GAP_MARK_TITLE = 64
SPLASH_GAP_TITLE_TAGLINE = 28

# ── 字体：(文件名, ttc 序号)，按顺序取第一个存在且字形齐全的 ──
FONT_DIR = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
TITLE_FONTS = [("msyhbd.ttc", 0), ("simhei.ttf", 0), ("Dengb.ttf", 0)]
MONO_FONTS = [("consola.ttf", 0), ("CascadiaMono.ttf", 0), ("lucon.ttf", 0), ("cour.ttf", 0)]
# 等宽字体通常没有中文字形，副标语里的汉字逐字回退到这里，仍按等宽网格排版
MONO_CJK_FALLBACK_FONTS = [("simhei.ttf", 0), ("msyh.ttc", 0), ("Deng.ttf", 0)]
CENTERED_PUNCTUATION = "·・•‧"  # 与汉字字面垂直居中的间隔号

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
LANCZOS = Image.Resampling.LANCZOS

Point = tuple[float, float]


# ── 几何 ─────────────────────────────────────────────────
@dataclass(frozen=True)
class Corner:
    start: Point   # 与来边的切点
    end: Point     # 与去边的切点
    center: Point  # 圆角圆心


@dataclass(frozen=True)
class MarkBounds:
    """旋转后价签的外框（设计坐标）。"""

    cx: float
    cy: float
    width: float
    height: float
    radius: float  # 价签上离外框中心最远的点的距离


def _unit(x: float, y: float) -> Point:
    length = math.hypot(x, y)
    return x / length, y / length


def tag_corners() -> list[Corner]:
    corners = []
    count = len(TAG_POINTS)
    for i, (px, py) in enumerate(TAG_POINTS):
        prev_x, prev_y = TAG_POINTS[i - 1]
        next_x, next_y = TAG_POINTS[(i + 1) % count]
        ux, uy = _unit(prev_x - px, prev_y - py)
        vx, vy = _unit(next_x - px, next_y - py)
        half_angle = math.acos(max(-1.0, min(1.0, ux * vx + uy * vy))) / 2
        tangent = TAG_CORNER_RADIUS / math.tan(half_angle)
        to_center = TAG_CORNER_RADIUS / math.sin(half_angle)
        bx, by = _unit(ux + vx, uy + vy)
        corners.append(Corner(
            start=(px + ux * tangent, py + uy * tangent),
            end=(px + vx * tangent, py + vy * tangent),
            center=(px + bx * to_center, py + by * to_center),
        ))
    return corners


def arc(center: Point, radius: float, start_angle: float, sweep: float) -> list[Point]:
    steps = max(2, math.ceil(abs(math.degrees(sweep)) / ARC_STEP_DEG))
    return [
        (center[0] + radius * math.cos(start_angle + sweep * k / steps),
         center[1] + radius * math.sin(start_angle + sweep * k / steps))
        for k in range(steps + 1)
    ]


def tag_outline() -> list[Point]:
    """圆角五边形轮廓：每个角是一段与两条边相切的圆弧，圆弧之间由直边相连。"""
    points: list[Point] = []
    for c in tag_corners():
        a0 = math.atan2(c.start[1] - c.center[1], c.start[0] - c.center[0])
        a1 = math.atan2(c.end[1] - c.center[1], c.end[0] - c.center[0])
        sweep = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        points += arc(c.center, TAG_CORNER_RADIUS, a0, sweep)
    return points


def circle(center: Point, radius: float) -> list[Point]:
    return arc(center, radius, 0.0, 2 * math.pi)[:-1]


def capsule(a: Point, b: Point, radius: float) -> list[Point]:
    """线段 a→b 加圆头的轮廓；共用端点的两段叠在一起就是圆角 L 形。"""
    angle = math.atan2(b[1] - a[1], b[0] - a[0])
    return arc(b, radius, angle - math.pi / 2, math.pi) + arc(a, radius, angle + math.pi / 2, math.pi)


def finder_polylines() -> list[tuple[Point, Point, Point]]:
    """取景框四个角，每个为 (竖臂端点, 角点, 横臂端点)。"""
    cx, cy = FINDER_CENTER
    half = FINDER_SIZE / 2
    lines = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = cx + sx * half, cy + sy * half
        lines.append(((x, y - sy * FINDER_ARM), (x, y), (x - sx * FINDER_ARM, y)))
    return lines


def rotate(p: Point) -> Point:
    """绕 PIVOT 逆时针旋转 ROTATION_DEG（屏幕坐标，y 向下）。"""
    t = math.radians(ROTATION_DEG)
    dx, dy = p[0] - PIVOT[0], p[1] - PIVOT[1]
    return (PIVOT[0] + dx * math.cos(t) + dy * math.sin(t),
            PIVOT[1] - dx * math.sin(t) + dy * math.cos(t))


def mark_bounds() -> MarkBounds:
    points = [rotate(p) for p in tag_outline()]
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    radius = max(math.hypot(x - cx, y - cy) for x, y in points)
    return MarkBounds(cx, cy, max(xs) - min(xs), max(ys) - min(ys), radius)


def placement(bounds: MarkBounds, px_per_unit: float, center_x: float, center_y: float, origin_y: float = 0.0):
    """设计坐标 → 超采样画布坐标。center_* 是标志外框中心在成品图中的位置（像素），
    origin_y 是超采样画布顶边在成品图中的位置。Pillow 以整数坐标为像素中心，故减 0.5。"""

    def to_canvas(points: list[Point]) -> list[Point]:
        out = []
        for p in points:
            x, y = rotate(p)
            fx = center_x + (x - bounds.cx) * px_per_unit
            fy = center_y + (y - bounds.cy) * px_per_unit - origin_y
            out.append((fx * SUPERSAMPLE - 0.5, fy * SUPERSAMPLE - 0.5))
        return out

    return to_canvas


def draw_mark(draw: ImageDraw.ImageDraw, to_canvas, *, hole, stroke: float = FINDER_STROKE,
              dot_radius: float = DOT_RADIUS) -> None:
    draw.polygon(to_canvas(tag_outline()), fill=TAG)
    draw.polygon(to_canvas(circle(HOLE_CENTER, HOLE_RADIUS)), fill=hole)
    for arm_end_a, corner, arm_end_b in finder_polylines():
        for end in (arm_end_a, arm_end_b):
            draw.polygon(to_canvas(capsule(corner, end, stroke / 2)), fill=INK)
    draw.polygon(to_canvas(circle(FINDER_CENTER, dot_radius)), fill=INK)


# ── PNG 素材 ─────────────────────────────────────────────
def render_icon(bounds: MarkBounds, size: int, stroke: float = FINDER_STROKE,
                dot_radius: float = DOT_RADIUS) -> Image.Image:
    image = Image.new("RGB", (size * SUPERSAMPLE,) * 2, INK)
    to_canvas = placement(bounds, ICON_MARK_WIDTH * size / bounds.width, size / 2, size / 2)
    draw_mark(ImageDraw.Draw(image), to_canvas, hole=INK, stroke=stroke, dot_radius=dot_radius)
    return image.resize((size, size), LANCZOS)


def render_adaptive_icon(bounds: MarkBounds) -> Image.Image:
    size = ICON_SIZE
    image = Image.new("RGBA", (size * SUPERSAMPLE,) * 2, (0, 0, 0, 0))
    px_per_unit = ADAPTIVE_SAFE_DIAMETER * size / 2 / bounds.radius
    # RGBA 上直接绘制是替换像素而非混合，穿孔因此是真正透明的
    draw_mark(ImageDraw.Draw(image), placement(bounds, px_per_unit, size / 2, size / 2), hole=(0, 0, 0, 0))
    return image.resize((size, size), LANCZOS)


# ── 文字 ─────────────────────────────────────────────────
_NOTDEF_PROBE = "\U0010FFFD"  # 私用区码位，字体里不会有，渲染出来就是 .notdef（方框）


def _glyph_signature(font: ImageFont.FreeTypeFont, ch: str) -> tuple[bytes, float]:
    probe = font.font_variant(size=32)
    canvas = Image.new("L", (96, 96))
    ImageDraw.Draw(canvas).text((16, 16), ch, font=probe, fill=255)
    return canvas.tobytes(), probe.getlength(ch)


def has_glyph(font: ImageFont.FreeTypeFont, ch: str) -> bool:
    return _glyph_signature(font, ch) != _glyph_signature(font, _NOTDEF_PROBE)


def open_font(name: str, index: int, size: float) -> ImageFont.FreeTypeFont | None:
    path = FONT_DIR / name
    if not path.exists():
        return None
    return ImageFont.truetype(str(path), size, index=index, layout_engine=ImageFont.Layout.BASIC)


def load_font(candidates: list[tuple[str, int]], size: float, text: str) -> ImageFont.FreeTypeFont:
    """第一个存在且包含 text 全部字形的字体，保证不会渲染出方框。"""
    for name, index in candidates:
        font = open_font(name, index, size)
        if font is not None and all(has_glyph(font, ch) for ch in set(text)):
            return font
    raise SystemExit(f"找不到能完整显示 {text!r} 的字体（候选：{candidates}）")


def load_mono_chain(size: float, text: str) -> list[ImageFont.FreeTypeFont]:
    mono = next((f for f in (open_font(n, i, size) for n, i in MONO_FONTS) if f is not None), None)
    if mono is None:
        raise SystemExit(f"找不到等宽字体（候选：{MONO_FONTS}）")
    missing = "".join(sorted({ch for ch in text if not has_glyph(mono, ch)}))
    return [mono, load_font(MONO_CJK_FALLBACK_FONTS, size, missing)] if missing else [mono]


@dataclass(frozen=True)
class PlacedGlyph:
    ch: str
    font: ImageFont.FreeTypeFont
    x: float   # 相对行首的基线左端
    dy: float  # 相对基线的竖直偏移


def layout_mono_line(text: str, fonts: list[ImageFont.FreeTypeFont], tracking: float):
    """等宽网格排版：半角占 1 格、全角占 2 格（格宽取等宽字体的字宽），字形在格内居中。
    返回 (字形列表, 行宽, (墨迹上沿, 墨迹下沿))，竖直量相对基线。"""
    cell = fonts[0].getlength("0")
    glyphs: list[PlacedGlyph] = []
    x = 0.0
    for ch in text:
        font = next(f for f in fonts if has_glyph(f, ch))
        width = cell * (2 if unicodedata.east_asian_width(ch) in "WF" else 1)
        glyphs.append(PlacedGlyph(ch, font, x + (width - font.getlength(ch)) / 2, 0.0))
        x += width + tracking

    wide = [g.font.getbbox(g.ch, anchor="ls") for g in glyphs if unicodedata.east_asian_width(g.ch) in "WF"]
    if wide:
        middle = (min(b[1] for b in wide) + max(b[3] for b in wide)) / 2
        for i, g in enumerate(glyphs):
            if g.ch in CENTERED_PUNCTUATION:
                _, top, _, bottom = g.font.getbbox(g.ch, anchor="ls")
                glyphs[i] = PlacedGlyph(g.ch, g.font, g.x, middle - (top + bottom) / 2)

    inked = [(g, g.font.getbbox(g.ch, anchor="ls")) for g in glyphs if not g.ch.isspace()]
    top = min(b[1] + g.dy for g, b in inked)
    bottom = max(b[3] + g.dy for g, b in inked)
    return glyphs, x - tracking, (top, bottom)


def render_splash(bounds: MarkBounds) -> tuple[Image.Image, list[ImageFont.FreeTypeFont]]:
    width, height = SPLASH_SIZE
    ss = SUPERSAMPLE
    title_font = load_font(TITLE_FONTS, SPLASH_TITLE_SIZE * ss, SPLASH_TITLE)
    tagline_fonts = load_mono_chain(SPLASH_TAGLINE_SIZE * ss, SPLASH_TAGLINE)

    title_left, title_top, title_right, title_bottom = title_font.getbbox(SPLASH_TITLE, anchor="ls")
    glyphs, line_width, (line_top, line_bottom) = layout_mono_line(
        SPLASH_TAGLINE, tagline_fonts, SPLASH_TAGLINE_TRACKING * SPLASH_TAGLINE_SIZE * ss)

    # 竖直布局（成品像素）：标志 / 标题 / 副标语 作为一个整体垂直居中
    mark_height = SPLASH_MARK_WIDTH * bounds.height / bounds.width
    total = (mark_height + SPLASH_GAP_MARK_TITLE + (title_bottom - title_top) / ss
             + SPLASH_GAP_TITLE_TAGLINE + (line_bottom - line_top) / ss)
    top = (height - total) / 2
    title_baseline = top + mark_height + SPLASH_GAP_MARK_TITLE - title_top / ss
    tagline_baseline = title_baseline + title_bottom / ss + SPLASH_GAP_TITLE_TAGLINE - line_top / ss

    # 背景是纯色，只在内容所在的横条里做 4 倍绘制，再贴回整张图
    band_top = math.floor(top) - 16
    band_height = math.ceil(top + total) + 16 - band_top
    band = Image.new("RGB", (width * ss, band_height * ss), PAPER)
    draw = ImageDraw.Draw(band)
    to_canvas = placement(bounds, SPLASH_MARK_WIDTH / bounds.width, width / 2, top + mark_height / 2, band_top)
    draw_mark(draw, to_canvas, hole=PAPER)
    draw.text(((width * ss - (title_right - title_left)) / 2 - title_left, (title_baseline - band_top) * ss),
              SPLASH_TITLE, font=title_font, fill=INK, anchor="ls")
    line_x = (width * ss - line_width) / 2
    for g in glyphs:
        draw.text((line_x + g.x, (tagline_baseline - band_top) * ss + g.dy),
                  g.ch, font=g.font, fill=GRAPHITE, anchor="ls")

    splash = Image.new("RGB", SPLASH_SIZE, PAPER)
    splash.paste(band.resize((width, band_height), LANCZOS), (0, band_top))
    return splash, [title_font, *tagline_fonts]


# ── SVG ─────────────────────────────────────────────────
def _num(value: float) -> str:
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return "0" if text == "-0" else text


def _pt(p: Point) -> str:
    return f"{_num(p[0])} {_num(p[1])}"


def mark_svg(bounds: MarkBounds) -> str:
    corners = tag_corners()
    r = _num(TAG_CORNER_RADIUS)
    tag_path = f"M{_pt(corners[0].end)}"
    for c in corners[1:] + corners[:1]:
        tag_path += f"L{_pt(c.start)}A{r} {r} 0 0 1 {_pt(c.end)}"
    hole_r = _num(HOLE_RADIUS)
    hole_d = _num(2 * HOLE_RADIUS)
    tag_path += (f"ZM{_pt((HOLE_CENTER[0] - HOLE_RADIUS, HOLE_CENTER[1]))}"
                 f"a{hole_r} {hole_r} 0 1 0 {hole_d} 0a{hole_r} {hole_r} 0 1 0 -{hole_d} 0Z")
    finder_path = "".join(f"M{_pt(a)}L{_pt(c)}L{_pt(b)}" for a, c, b in finder_polylines())
    view_box = f"{_num(bounds.cx - 50)} {_num(bounds.cy - 50)} 100 100"  # 以旋转后的外框为中心
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" width="256" height="256" '
        f'role="img" aria-label="{SPLASH_TITLE}">\n'
        f'  <g transform="rotate({_num(-ROTATION_DEG)} {_pt(PIVOT)})">\n'
        f'    <path fill="{TAG}" fill-rule="evenodd" d="{tag_path}"/>\n'
        f'    <path fill="none" stroke="{INK}" stroke-width="{_num(FINDER_STROKE)}" '
        f'stroke-linecap="round" stroke-linejoin="round" d="{finder_path}"/>\n'
        f'    <circle cx="{_num(FINDER_CENTER[0])}" cy="{_num(FINDER_CENTER[1])}" r="{_num(DOT_RADIUS)}" '
        f'fill="{INK}"/>\n'
        f'  </g>\n'
        f'</svg>\n'
    )


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    bounds = mark_bounds()
    splash, fonts = render_splash(bounds)
    outputs = {
        "icon.png": render_icon(bounds, ICON_SIZE),
        "adaptive-icon.png": render_adaptive_icon(bounds),
        "splash.png": splash,
        "favicon.png": render_icon(bounds, FAVICON_SIZE, FAVICON_FINDER_STROKE, FAVICON_DOT_RADIUS),
    }
    for name, image in outputs.items():
        image.save(ASSETS_DIR / name, optimize=True)
        print(f"{name}: {image.width}x{image.height} {image.mode}")
    (ASSETS_DIR / "logo-mark.svg").write_text(mark_svg(bounds), encoding="utf-8", newline="\n")
    print("logo-mark.svg")
    for font in fonts:
        print(f"font: {' '.join(font.getname())} <- {Path(font.path).name}")


if __name__ == "__main__":
    main()
