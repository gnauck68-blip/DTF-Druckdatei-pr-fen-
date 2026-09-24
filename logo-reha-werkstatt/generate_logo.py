import math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = "/home/user/DTF-Druckdatei-pr-fen-/logo-reha-werkstatt"
TEAL, ORANGE, DARK = "#0E6E73", "#F28C28", "#1F2A30"

def text_path(txt, font_file, size, x, y, tracking=0.0):
    f = TTFont(font_file); gs = f.getGlyphSet(); cmap = f.getBestCmap()
    upm = f["head"].unitsPerEm; s = size / upm
    pen = SVGPathPen(gs); cx = 0
    for ch in txt:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, x + cx, y))
        gs[g].draw(tp)
        cx += gs[g].width * s + tracking * size
    return pen.getCommands(), cx - tracking * size

def gear(cx, cy, r_out, r_root, teeth):
    pts = []
    step = 2 * math.pi / teeth
    for i in range(teeth):
        a = i * step - math.pi / 2
        for frac, r in ((-0.30, r_root), (-0.18, r_out), (0.18, r_out), (0.30, r_root)):
            ang = a + frac * step
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + " Z"

def mark(ring, accent, hole="#FFFFFF"):
    # Zahnrad (Werkstatt) mit Mensch mit offenen Armen (Reha)
    return f'''<g>
  <path d="{gear(100,100,96,82,12)}" fill="{ring}"/>
  <circle cx="100" cy="100" r="64" fill="{hole}"/>
  <circle cx="100" cy="70" r="13" fill="{accent}"/>
  <path d="M60 86 Q100 128 140 86" fill="none" stroke="{accent}" stroke-width="13" stroke-linecap="round"/>
  <path d="M82 146 L100 110 L118 146" fill="none" stroke="{ring}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
</g>'''

BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

def svg(w, h, body, bg=None):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">\n<title>Reha Werkstatt Offenburg</title>\n{b}{body}\n</svg>\n'

def horizontal(ring, accent, textc, subc, hole="#FFFFFF", bg=None):
    t1, w1 = text_path("REHA WERKSTATT", BOLD, 60, 0, 0, 0.02)
    t2, w2 = text_path("OFFENBURG", REG, 36, 0, 0, 0.32)
    tx = 236
    body = mark(ring, accent, hole)
    body += f'<path transform="translate({tx},108)" d="{t1}" fill="{textc}"/>'
    body += f'<rect x="{tx}" y="126" width="{w1:.1f}" height="4" fill="{accent}"/>'
    body += f'<path transform="translate({tx},172)" d="{t2}" fill="{subc}"/>'
    W = int(tx + max(w1, w2) + 20)
    return svg(W, 200, body, bg)

def vertical(ring, accent, textc, subc, hole="#FFFFFF", bg=None):
    t1, w1 = text_path("REHA WERKSTATT", BOLD, 44, 0, 0, 0.02)
    t2, w2 = text_path("OFFENBURG", REG, 28, 0, 0, 0.32)
    W = int(max(w1, w2) + 40)
    ox = (W - 200) / 2
    body = f'<g transform="translate({ox:.1f},10)">{mark(ring, accent, hole)}</g>'
    body += f'<path transform="translate({(W-w1)/2:.1f},270)" d="{t1}" fill="{textc}"/>'
    body += f'<rect x="{(W-w1)/2:.1f}" y="284" width="{w1:.1f}" height="3" fill="{accent}"/>'
    body += f'<path transform="translate({(W-w2)/2:.1f},322)" d="{t2}" fill="{subc}"/>'
    return svg(W, 340, body, bg)

files = {
 "logo-horizontal.svg": horizontal(TEAL, ORANGE, DARK, TEAL),
 "logo-vertikal.svg": vertical(TEAL, ORANGE, DARK, TEAL),
 "logo-negativ.svg": horizontal("#FFFFFF", ORANGE, "#FFFFFF", "#FFFFFF", hole=TEAL, bg=TEAL),
 "logo-schwarz.svg": horizontal("#000000", "#000000", "#000000", "#000000"),
 "bildmarke.svg": svg(200, 200, mark(TEAL, ORANGE)),
}
for n, c in files.items():
    open(os.path.join(OUT, n), "w").write(c)
print("ok")
