# -*- coding: utf-8 -*-
"""Genera todos los assets de marca a partir del isotipo y el logotipo Cosmos.

Fuentes (no se modifican):
  cosmos-front/public/cosmos_isotipo_azul3_fondo_transparente.png
  cosmos-front/public/cosmos_logotipo_azul3_fondo_transparente.png

Salidas: favicons e imágenes de interfaz de la web y de la app, iconos de
lanzador de Android (clásico, redondo y adaptativo) y las pantallas de splash
nativas en todas las densidades.

Uso:  python tools/generate-brand-assets.py
Requiere Pillow.  Es idempotente: sobreescribe siempre el mismo conjunto.
"""
import os
from PIL import Image, ImageDraw

ROOT = 'C:/Marcos/Proyectos/Cosmos/code-cosmos'
FRONT = f'{ROOT}/cosmos-front'
APP = f'{ROOT}/cosmos-app'
RES = f'{APP}/android/app/src/main/res'

ISOTIPO = f'{FRONT}/public/cosmos_isotipo_azul3_fondo_transparente.png'
LOGOTIPO = f'{FRONT}/public/cosmos_logotipo_azul3_fondo_transparente.png'

BRAND = (0, 61, 83)          # #003d53
WHITE = (255, 255, 255)

created = []


def load_trimmed(path):
    """Carga la imagen y recorta el margen transparente sobrante."""
    im = Image.open(path).convert('RGBA')
    return im.crop(im.getbbox())


def recolor(im, rgb):
    """Cambia el color del trazo conservando el canal alfa (el logo es plano)."""
    out = Image.new('RGBA', im.size, (*rgb, 0))
    out.putalpha(im.getchannel('A'))
    solid = Image.new('RGBA', im.size, (*rgb, 255))
    solid.putalpha(im.getchannel('A'))
    return solid


def fit_on_canvas(art, canvas_w, canvas_h, coverage, background=None, radius=None, circle=False):
    """Escala `art` para ocupar `coverage` del lienzo y lo centra."""
    max_w = canvas_w * coverage
    max_h = canvas_h * coverage
    ratio = min(max_w / art.width, max_h / art.height)
    w = max(1, int(round(art.width * ratio)))
    h = max(1, int(round(art.height * ratio)))
    art = art.resize((w, h), Image.LANCZOS)

    if background is None:
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (*background, 255))
        if circle:
            mask = Image.new('L', (canvas_w * 4, canvas_h * 4), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, canvas_w * 4 - 1, canvas_h * 4 - 1], fill=255)
            canvas.putalpha(mask.resize((canvas_w, canvas_h), Image.LANCZOS))
        elif radius:
            mask = Image.new('L', (canvas_w * 4, canvas_h * 4), 0)
            ImageDraw.Draw(mask).rounded_rectangle(
                [0, 0, canvas_w * 4 - 1, canvas_h * 4 - 1], radius=radius * 4, fill=255)
            canvas.putalpha(mask.resize((canvas_w, canvas_h), Image.LANCZOS))

    canvas.alpha_composite(art, ((canvas_w - w) // 2, (canvas_h - h) // 2))
    return canvas


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'PNG', optimize=True)
    created.append((path.replace(ROOT + '/', ''), f'{im.width}x{im.height}', f'{os.path.getsize(path)/1024:.1f}KB'))


iso = load_trimmed(ISOTIPO)
logo = load_trimmed(LOGOTIPO)
iso_white = recolor(iso, WHITE)
logo_white = recolor(logo, WHITE)
iso_brand = recolor(iso, BRAND)

# ---------------------------------------------------------------- web y app
for base in (f'{FRONT}/public', f'{APP}/public'):
    # Logotipo e isotipo listos para usar en la interfaz
    ratio = 1200 / logo.width
    save(logo.resize((1200, int(round(logo.height * ratio))), Image.LANCZOS),
         f'{base}/images/cosmos-logotipo.png')
    save(logo_white.resize((1200, int(round(logo_white.height * ratio))), Image.LANCZOS),
         f'{base}/images/cosmos-logotipo-blanco.png')
    save(fit_on_canvas(iso, 512, 512, 0.86), f'{base}/images/cosmos-isotipo.png')
    save(fit_on_canvas(iso_white, 512, 512, 0.86), f'{base}/images/cosmos-isotipo-blanco.png')

    # Favicon PNG (fondo transparente, para pestañas claras y oscuras el trazo
    # se mantiene legible por su contraste medio)
    save(fit_on_canvas(iso, 512, 512, 0.82), f'{base}/favicon.png')

    # Icono para pantalla de inicio en iOS y Android: fondo sólido, sin alfa
    save(fit_on_canvas(iso_white, 180, 180, 0.62, background=BRAND).convert('RGB').convert('RGBA'),
         f'{base}/apple-touch-icon.png')

    # ICO multi-resolución
    ico_src = fit_on_canvas(iso, 256, 256, 0.82)
    ico_path = f'{base}/favicon.ico'
    ico_src.save(ico_path, 'ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    created.append((ico_path.replace(ROOT + '/', ''), '16..256', f'{os.path.getsize(ico_path)/1024:.1f}KB'))

# ------------------------------------------------------- iconos de Android
# Icono clásico: fondo blanco, marca en color de marca.
LAUNCHER = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# Primer plano del icono adaptativo: lienzo de 108dp con la marca dentro de la
# zona segura central de 66dp, es decir un 61% del lienzo como máximo.
FOREGROUND = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

for density, size in LAUNCHER.items():
    save(fit_on_canvas(iso_brand, size, size, 0.66, background=WHITE, radius=int(size * 0.18)),
         f'{RES}/mipmap-{density}/ic_launcher.png')
    save(fit_on_canvas(iso_brand, size, size, 0.60, background=WHITE, circle=True),
         f'{RES}/mipmap-{density}/ic_launcher_round.png')

for density, size in FOREGROUND.items():
    save(fit_on_canvas(iso_brand, size, size, 0.42),
         f'{RES}/mipmap-{density}/ic_launcher_foreground.png')

# --------------------------------------------------------- splash nativo
SPLASH_PORT = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280),
               'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}

for density, (w, h) in SPLASH_PORT.items():
    save(fit_on_canvas(logo_white, w, h, 0.66, background=BRAND), f'{RES}/drawable-port-{density}/splash.png')
    save(fit_on_canvas(logo_white, h, w, 0.44, background=BRAND), f'{RES}/drawable-land-{density}/splash.png')

save(fit_on_canvas(logo_white, 480, 320, 0.62, background=BRAND), f'{RES}/drawable/splash.png')

print(f'{len(created)} archivos generados\n')
for path, size, weight in created:
    print(f'  {size:>10}  {weight:>8}  {path}')

# ------------------------------------------- icono del splash de Android 12+
# En API 31 el sistema dibuja el icono sobre `windowSplashScreenBackground`,
# que es el color de marca. El isotipo tiene que ir en blanco o no se vería.
# El lienzo equivale a 240dp y la zona segura es el centro (160dp), de ahí la
# cobertura del 42%.
extra = []
for density, size in FOREGROUND.items():
    p = f'{RES}/mipmap-{density}/ic_splash_icon.png'
    im = fit_on_canvas(iso_white, size, size, 0.42)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, 'PNG', optimize=True)
    extra.append((p.replace(ROOT + '/', ''), f'{size}x{size}', f'{os.path.getsize(p)/1024:.1f}KB'))

print(f'\n{len(extra)} iconos de splash Android 12+:')
for path, size, weight in extra:
    print(f'  {size:>10}  {weight:>8}  {path}')


# ------------------------------------------- fondo del login en duotono
# La foto del puerto venia teñida de azul. Se pasa a luminancia y se vuelve a
# tonificar con la rampa corporativa, de modo que el fondo acompañe a la paleta.
# Como efecto secundario el archivo baja de ~540KB a ~90KB.
from PIL import ImageOps

def duotone(path, shadow, highlight):
    base = ImageOps.autocontrast(ImageOps.grayscale(Image.open(path).convert('RGB')), cutoff=1)
    lut = []
    for ch in range(3):
        lut += [round(shadow[ch] + (highlight[ch] - shadow[ch]) * i / 255) for i in range(256)]
    return Image.merge('RGB', (base, base, base)).point(lut)

bg = f'{FRONT}/public/images/background-login.jpg'
if os.path.exists(bg):
    toned = duotone(bg, (0, 16, 25), (10, 104, 138))
    for dest in (bg, f'{APP}/public/images/background-login.jpg'):
        toned.save(dest, 'JPEG', quality=86, optimize=True, progressive=True)
        print(f'  fondo de login: {dest.replace(ROOT + "/", "")}  {os.path.getsize(dest)/1024:.0f}KB')
