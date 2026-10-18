# -*- coding: utf-8 -*-
"""Generate docs/demo.gif — animated walkthrough of the split-screen editor UI."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 960, 600
BG = (15, 23, 42)          # slate-900
PANEL = (248, 250, 252)    # slate-50
CARD = (255, 255, 255)
ACCENT = (37, 99, 235)     # blue-600
GREEN = (22, 163, 74)
TEXT = (15, 23, 42)
MUTED = (100, 116, 139)
CODE_BG = (2, 6, 23)
CODE_FG = (199, 210, 254)
KEYWORD = (129, 140, 248)
ERROR_BG = (254, 226, 226)

FONT_PATH_CANDIDATES = [
    "C:/Windows/Fonts/consola.ttf",
    "C:/Windows/Fonts/cour.ttf",
    "C:/Windows/Fonts/lucon.ttf",
]
FONT_PATH_UI = "C:/Windows/Fonts/segoeui.ttf"
FONT_PATH_UIB = "C:/Windows/Fonts/segoeuib.ttf"
FONT_PATH_UII = "C:/Windows/Fonts/segoeuii.ttf"


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


mono_s = load_font(FONT_PATH_CANDIDATES[0], 13)
mono_m = load_font(FONT_PATH_CANDIDATES[0], 15)
mono_hl = load_font(FONT_PATH_CANDIDATES[0], 15)
ui_s = load_font(FONT_PATH_UI, 12)
ui_m = load_font(FONT_PATH_UI, 15)
ui_l = load_font(FONT_PATH_UIB, 20)
ui_xl = load_font(FONT_PATH_UIB, 26)
ui_s_b = load_font(FONT_PATH_UIB, 12)
ui_s_i = load_font(FONT_PATH_UII, 12)

DBML_SAMPLE = [
    ("keyword", "Table users {"),
    ("normal", "  id integer [pk, increment]"),
    ("normal", "  username varchar(255) [not null, unique]"),
    ("normal", "  email varchar(255) [unique]"),
    ("normal", "  created_at timestamp"),
    ("keyword", "}"),
    ("", ""),
    ("keyword", "Table posts {"),
    ("normal", "  id integer [pk]"),
    ("normal", "  user_id integer [ref: > users.id]"),
    ("normal", "  title varchar(255)"),
    ("normal", "  body text [null]"),
    ("keyword", "}"),
    ("", ""),
    ("keyword", "Ref: posts.user_id > users.id"),
]

SQL_SAMPLE = [
    "-- Auto-generated migration from DBML",
    "CREATE TABLE IF NOT EXISTS users (",
    '  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,',
    '  "username" varchar(255) NOT NULL UNIQUE,',
    '  "email" varchar(255) UNIQUE,',
    '  "created_at" timestamp',
    ");",
    "",
    "CREATE TABLE IF NOT EXISTS posts (",
    '  "id" integer PRIMARY KEY,',
    '  "user_id" integer,',
    '  "title" varchar(255),',
    '  "body" text',
    ");",
    "",
    "ALTER TABLE posts ADD CONSTRAINT fk_posts_user_id",
    '  FOREIGN KEY ("user_id") REFERENCES users("id");',
]


def shadow(draw, box, radius=10, offset=(0, 2)):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(
        (x0 + offset[0], y0 + offset[1], x1 + offset[0], y1 + offset[1]),
        radius=radius,
        fill=(203, 213, 225),
    )


def rounded_button(draw, box, text, fill, fg=(255, 255, 255), hover=False):
    shadow(draw, box)
    draw.rounded_rectangle(box, radius=8, fill=fill)
    bbox = draw.textbbox((0, 0), text, font=ui_s_b)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (box[0] + box[2]) / 2 - tw / 2 - bbox[0]
    y = (box[1] + box[3]) / 2 - th / 2
    draw.text((x, y), text, fill=fg, font=ui_s_b)


def draw_header(d):
    d.text((36, 22), "Interactive Split-Screen UI", fill=(255, 255, 255), font=ui_l)
    d.text((36, 48), "DBML  →  PostgreSQL SQL + ER diagram  ·  DBML to Supabase AI series", fill=MUTED, font=ui_s)
    rounded_button(d, (700, 24, 830, 56), "Parse DBML → SQL", ACCENT)
    rounded_button(d, (842, 24, 924, 56), "Load sample", (241, 245, 249), fg=TEXT)


def panel_box(d, x0, y0, x1, y1, title, right=None):
    shadow(d, (x0, y0, x1, y1))
    d.rounded_rectangle((x0, y0, x1, y1), radius=10, fill=CARD)
    d.rounded_rectangle((x0, y0, x1, y1), radius=10, outline=(226, 232, 240))
    d.text((x0 + 16, y0 + 10), title, fill=TEXT, font=ui_s_b)
    if right:
        bbox = d.textbbox((0, 0), right, font=ui_s)
        tw = bbox[2] - bbox[0]
        d.text((x1 - 16 - tw, y0 + 11), right, fill=MUTED, font=ui_s)
    d.line((x0, y0 + 38, x1, y0 + 38), fill=(226, 232, 240))


def draw_editor(d, x0, y0, x1, y1, text_lines, cursor_line=None, cursor_col=0, typed_chars=0):
    panel_box(d, x0, y0, x1, y1, "DBML Editor", "Ctrl+Enter to parse")
    d.text((x0 + 16, y0 + 52), text_lines[0][1][:typed_chars] if typed_chars is not None else "", fill=(30, 41, 59), font=mono_s)
    return


def draw_dbml_block(d, x0, y0, x1, y1, prefix=""):
    panel_box(d, x0, y0, x1, y1, "DBML Editor", "Ctrl+Enter to parse")
    yy = y0 + 52
    for kind, line in DBML_SAMPLE:
        shown = line
        color = CODE_FG
        if kind == "keyword":
            color = (129, 140, 248)
        d.text((x0 + 18, yy), shown, fill=color, font=mono_m)
        yy += 22
        if yy > y1 - 20:
            break


def draw_sql(d, x0, y0, x1, y1, success=True, ring=None):
    panel_box(d, x0, y0, x1, y1, "Output — Migration SQL", f"{len(SQL_SAMPLE)} lines")
    d.rectangle((x0 + 1, y0 + 39, x1 - 1, y1 - 1), fill=CODE_BG)
    yy = y0 + 50
    for line in SQL_SAMPLE:
        color = (148, 163, 184)
        if line.strip().upper().startswith("CREATE") or line.strip().upper().startswith("ALTER"):
            color = (134, 239, 172)
        elif line.startswith("--"):
            color = (100, 116, 139)
        d.text((x0 + 16, yy), line, fill=color, font=mono_s)
        yy += 18
        if yy > y1 - 10:
            break
    if ring is not None:
        pass
    return


def draw_erd(d, x0, y0, x1, y1, ring=None):
    panel_box(d, x0, y0, x1, y1, "Output — Table Diagram (ERD)", "Mermaid")
    cx_u = x0 + ((x1 - x0) * 0.30)
    cx_p = x0 + ((x1 - x0) * 0.70)
    cy = y0 + (y1 - y0) * 0.55
    w, h = 200, 150
    box_u = (cx_u - w / 2, cy - h / 2, cx_u + w / 2, cy + h / 2)
    box_p = (cx_p - w / 2, cy - h / 2, cx_p + w / 2, cy + h / 2)
    shadow(d, box_u, offset=(0, 2))
    shadow(d, box_p, offset=(0, 2))
    d.rounded_rectangle(box_u, radius=8, fill=CARD, outline=(203, 213, 225))
    d.rounded_rectangle(box_p, radius=8, fill=CARD, outline=(203, 213, 225))
    d.rectangle((box_u[0], box_u[1], box_u[2], box_u[1] + 26), fill=(37, 99, 235))
    d.rectangle((box_p[0], box_p[1], box_p[2], box_p[1] + 26), fill=(124, 58, 237))
    d.text((box_u[0] + 12, box_u[1] + 5), "users", fill=(255, 255, 255), font=ui_s_b)
    d.text((box_p[0] + 12, box_p[1] + 5), "posts", fill=(255, 255, 255), font=ui_s_b)
    for i, c in enumerate(["id  PK", "username", "email", "created_at"]):
        d.text((box_u[0] + 12, box_u[1] + 32 + i * 16), f"{i+1} . {c}", fill=(51, 65, 85), font=mono_s)
    for i, c in enumerate(["id  PK", "user_id  FK", "title", "body"]):
        d.text((box_p[0] + 12, box_p[1] + 32 + i * 16), f"{i+1} . {c}", fill=(51, 65, 85), font=mono_s)
    d.line((box_u[2], cy, box_p[0], cy), fill=(100, 116, 139), width=2)
    d.text(((box_u[2] + box_p[0]) / 2 - 62, cy - 26), 'posts.user_id > users.id', fill=MUTED, font=ui_s)
    if ring:
        p0, p1 = ring
        d.ellipse((p0[0] - 8, p0[1] - 8, p0[0] + 8, p0[1] + 8), outline=(250, 204, 21), width=3)


def draw_copy_toast(d, x0, y0, x1, y1):
    rounded_button(d, (x1 - 208, y0 + 46, x1 - 122, y0 + 68), "Copied!", GREEN)
    d.rounded_rectangle((x1 - 300, y1 - 60, x1 - 20, y1 - 28), radius=8, fill=(16, 185, 129))
    d.text((x1 - 288, y1 - 54), "✓  SQL copied to clipboard", fill=(255, 255, 255), font=ui_s_b)


def draw_invalid_banner(d):
    d.rounded_rectangle((36, 70, W - 36, 108), radius=8, fill=ERROR_BG, outline=(254, 202, 202))
    d.text((52, 80), "DBML is empty.  Hint: write at least one Table block, e.g.  Table users { id uuid }", fill=(185, 28, 28), font=ui_s_b)


def frames():
    out = []
    base = lambda: Image.new("RGB", (W, H), BG)
    x0a, y0a, x1a, y1a = 36, 128, 494, 564
    x0b, y0b, x1b, y1b = 514, 128, 924, 564

    # 1. Splash/typing in editor
    im = base(); d = ImageDraw.Draw(im)
    draw_header(d); draw_dbml_block(d, x0a, y0a, x1a, y1a)
    panel_box(d, x0b, y0b, x1b, y1b, "Output", "")
    d.rectangle((x0b + 1, y0b + 39, x1b - 1, y1b - 1), fill=CODE_BG)
    d.text((x0b + 24, (y0b + y1b) / 2), "Parsed SQL will appear here…", fill=(148, 163, 184), font=ui_s)
    draw_erd_placeholder(d, x0b, y0b, x1b, y1b)
    out.append(im); out.append(im)

    # 2-3. Typing progress + highlight
    for k in range(2):
        im = base(); d = ImageDraw.Draw(im)
        draw_header(d); draw_dbml_block(d, x0a, y0a, x1a, y1a)
        draw_erd_placeholder(d, x0b, y0b, x1b, y1b)
        draw_erd(d, x0b, y0b, x1b, y1b)
        out.append(im)

    # 3. SQL appearing (slide)
    im = base(); draw_header(d)
    d = ImageDraw.Draw(im)
    draw_dbml_block(d, x0a, y0a, x1a, y1a)
    draw_sql(d, x0b, y0b, x1b, y1b, ring=((x0b + 30, y0b + 58), None))
    draw_erd(d, x0b, y0b, x1b, y1b)
    d.text((700, 62), "", fill=(255, 255, 255), font=ui_s)
    rounded_button(d, (700, 66, 796, 88), "Parse DBML → SQL", (29, 78, 216))
    out.append(im)

    # 4. Full result with MERMAID and ring/ERD
    im = base(); d = ImageDraw.Draw(im)
    draw_header(d)
    rounded_button(d, (700, 66, 796, 88), "Parse DBML → SQL", (29, 78, 216))
    draw_dbml_block(d, x0a, y0a, x1a, y1a)
    draw_sql(d, x0b, y0b, x1b, y1b)
    draw_erd(d, x0b, y0b, x1b, y1b)
    draw_copy_toast(d, x0b, y0b, x1b, y1b)
    out.append(im); out.append(im); out.append(im)

    # 5. Export / finish
    im = base(); d = ImageDraw.Draw(im)
    draw_header(d)
    rounded_button(d, (700, 66, 796, 88), "Parse DBML → SQL", (29, 78, 216))
    draw_dbml_block(d, x0a, y0a, x1a, y1a)
    draw_sql(d, x0b, y0b, x1b, y1b)
    draw_erd(d, x0b, y0b, x1b, y1b)
    d.rounded_rectangle((640, y1b + 10, 900, y1b + 40), radius=8, fill=(240, 253, 244), outline=(187, 247, 208))
    out.append(im)

    # Error state
    im = base(); d = ImageDraw.Draw(im)
    draw_header(d)
    draw_invalid_banner(d)
    panel_box(d, x0a, y0a, x1a, y1a, "DBML Editor", "Ctrl+Enter to parse")
    panel_box(d, x0b, y0b, x1b, y1b, "Output", "")
    d.rectangle((x0b + 1, y0b + 39, x1b - 1, y1b - 1), fill=CODE_BG)
    d.text((x0b + 24, (y0b + y1b) / 2), "Parsed SQL will appear here…", fill=(148, 163, 184), font=ui_s)
    draw_erd(d, x0b, y0b, x1b, y1b)
    out.append(im)

    return out


def draw_erd_placeholder(d, x0, y0, x1, y1):
    shadow(d, (x0, y0, x1, y1))
    d.rounded_rectangle((x0, y0, x1, y1), radius=10, fill=CARD, outline=(226, 232, 240))


def build():
    frames_list = frames()
    durations = []
    seq = [0, 0, 1, 2, 3, 4, 4, 4, 5]
    gif_frames = []
    for idx in seq:
        gif_frames.append(frames_list[idx])
        durations.append(900 if idx == 4 else 700)
    os.makedirs("D:/Github/Day 4/docs", exist_ok=True)
    out_path = "D:/Github/Day 4/docs/demo.gif"
    gif_frames[0].save(
        out_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=durations,
        loop=0,
        optimize=False,
    )
    print("saved", out_path, len(gif_frames), "frames")


if __name__ == "__main__":
    build()
