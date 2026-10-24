# Глаза кота: каждый глаз вписывается в ширину глаза референса и ставится центром на его место (координаты — src/theme/cats/cat-layout.json).
# python3 -I tools/cat-eyes.py <вырезанный png 1254×1254 без обрезки> <имя файла> [ширина в долях глаза, по умолчанию 1]
import sys, json
from PIL import Image
import numpy as np
src, name = sys.argv[1], sys.argv[2]
wk = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
L = json.load(open('src/theme/cats/cat-layout.json'))
k = L['scale']
REF = {'l': (467, 468, 150), 'r': (780, 468, 150)}   # центр x, y и ширина глаза на референсе
BOX = (360, 330, 890, 600)                            # общий холст всех вариантов глаз, в координатах референса
im = Image.open(src).convert('RGBA')
a = np.asarray(im)[..., 3]
out = Image.new('RGBA', (round((BOX[2]-BOX[0])*k), round((BOX[3]-BOX[1])*k)), (0, 0, 0, 0))
for side, (x0, x1) in (('l', (0, 627)), ('r', (627, 1254))):
    ys, xs = np.where(a[:, x0:x1] > 30)
    bx0, bx1, by0, by1 = xs.min()+x0, xs.max()+x0, ys.min(), ys.max()
    cx, cy, w = REF[side]
    s = w * wk / (bx1-bx0+1)
    eye = im.crop((bx0, by0, bx1+1, by1+1))
    eye = eye.resize((max(1, round(eye.width*s*k)), max(1, round(eye.height*s*k))), Image.LANCZOS)
    out.alpha_composite(eye, (round((cx-BOX[0])*k - eye.width/2), round((cy-BOX[1])*k - eye.height/2)))
L['eyes'] = [BOX[0], BOX[1]]
json.dump(L, open('src/theme/cats/cat-layout.json', 'w'), ensure_ascii=False, indent=2)
out.save(f'src/assets/{name}.png'); print(name, out.size)
