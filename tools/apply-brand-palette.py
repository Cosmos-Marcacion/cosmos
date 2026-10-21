# -*- coding: utf-8 -*-
"""Aplica la paleta derivada del logotipo Cosmos a la web y a la app."""
import io, os, re

ROOT = 'C:/Marcos/Proyectos/Cosmos/code-cosmos'

# Paleta anterior -> nueva. Los roles se mantienen, solo cambia el tono.
PALETTE = {
    1: ('#041033', '#003d53', 'Marca. Titulares, texto principal y superficies oscuras.'),
    2: ('#0057dd', '#007099', 'Accion primaria: botones, enlaces y bordes de enfasis.'),
    3: ('#6580de', '#0087b8', 'Bordes y separadores suaves (se usa sobre todo al 20%).'),
    4: ('#298267', '#147b66', 'Exito.'),
    5: ('#e86339', '#b26206', 'Aviso.'),
    6: ('#ed3241', '#c62828', 'Error.'),
    7: ('#f5f7fa', '#f3f8f9', 'Fondo general de la aplicacion.'),
}
BRAND = '#003d53'

# Rampa tonal usada para sustituir la familia `blue` de Tailwind.
RAMP = {
    50: '#f3f8f9', 100: '#e3f0f4', 200: '#c6e4ee', 300: '#96d3e9', 400: '#4cc1eb',
    500: '#06adea', 600: '#0087b8', 700: '#006387', 800: '#004d69', 900: '#003d53',
    950: '#002736',
}


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def build_variables(project_note):
    lines = [
        '// Paleta corporativa Cosmos Global Logistics.',
        '//',
        '// Derivada del color del isotipo y el logotipo (#003d53, matiz 196deg).',
        '// Los tonos se eligieron comprobando el contraste segun WCAG: todos los',
        '// colores sobre los que se escribe texto blanco superan 4.5:1.',
        '//',
        f'// {project_note}',
        '// Generado por tools/apply-brand-palette.py',
        '',
        f'$brand: {BRAND};',
        '',
    ]
    for n, (_old, new, role) in PALETTE.items():
        lines.append(f'$color{n}: {new}; // {role}')
    lines.append('')
    for alpha in (80, 60, 40, 20):
        for n, (_old, new, _role) in PALETTE.items():
            r, g, b = hex2rgb(new)
            lines.append(f'$color{n}-{alpha}: rgba({r}, {g}, {b}, {alpha / 100:g});')
        lines.append('')
    return '\n'.join(lines).rstrip() + '\n'


def patch_tailwind(path):
    s = io.open(path, encoding='utf-8').read()
    if 'cosmos' in s:
        return False, 'ya tenia la paleta'
    ramp = ',\n'.join(f"          {k}: '{v}'," for k, v in RAMP.items()).rstrip(',')
    block = f"""  theme: {{
    extend: {{
      colors: {{
        // Paleta corporativa Cosmos, derivada del color del logotipo (#003d53).
        cosmos: {{
{ramp}
        }},
        // La interfaz ya usaba la familia `blue` de Tailwind en decenas de
        // sitios. Se reasigna a la rampa corporativa para que esas clases pasen
        // a ser de marca sin tener que tocar el marcado.
        blue: {{
{ramp}
        }},
      }},
    }},
  }},"""
    s2 = re.sub(r'  theme: \{\n    extend: \{\},\n  \},', block, s, count=1)
    if s2 == s:
        return False, 'no se encontro el bloque theme'
    io.open(path, 'w', encoding='utf-8').write(s2)
    return True, 'paleta añadida y familia blue reasignada'


# Literales incrustados fuera de variables.scss.
LITERALS = {}
for _n, (old, new, _r) in PALETTE.items():
    LITERALS[old] = new
LITERALS.update({
    '#007bff': '#007099',   # azul de Bootstrap usado como acento -> color2
    '#0056b3': '#005a7a',   # su variante hover -> color2 oscurecido
    '#3b82f6': '#007099',   # blue-500 de Tailwind -> color2
    '#60a5fa': '#0087b8',   # blue-400 -> color3
    '#1e40af': '#003d53',   # azul de la barra de estado -> marca
    '#3ac0a0': '#147b66',   # verde de confirmacion -> color4
    '#f56565': '#c62828',   # rojo de confirmacion -> color6
    '#4472c4': '#003d53',   # acento de los reportes Excel -> marca
    '#0b1220': '#002736',   # fondo del correo -> marca oscurecida
})

RGB_MAP = {hex2rgb(o): hex2rgb(n) for o, n in
           [(PALETTE[i][0], PALETTE[i][1]) for i in PALETTE] +
           [('#60a5fa', '#0087b8')]}

SKIP_FILES = {'tools/apply-brand-palette.py'}


def patch_literals(paths):
    changed = []
    hex_re = re.compile('|'.join(re.escape(k) for k in LITERALS), re.I)
    rgba_re = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+\s*)?\)')

    def rgba_sub(m):
        rgb = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if rgb not in RGB_MAP:
            return m.group(0)
        r, g, b = RGB_MAP[rgb]
        tail = m.group(4) or ''
        fn = 'rgba' if tail else 'rgb'
        return f'{fn}({r}, {g}, {b}{tail})'

    for p in paths:
        rel = p.replace(ROOT + '/', '')
        if rel in SKIP_FILES or 'variables.scss' in rel:
            continue
        s = io.open(p, encoding='utf-8', errors='ignore').read()
        n1 = len(hex_re.findall(s))
        s2 = hex_re.sub(lambda m: LITERALS[m.group(0).lower()], s)
        before = s2
        s2 = rgba_re.sub(rgba_sub, s2)
        n2 = sum(1 for _ in re.finditer(r'rgba?\(', before)) if before != s2 else 0
        if s2 != s:
            io.open(p, 'w', encoding='utf-8').write(s2)
            changed.append((rel, n1, before != s2))
    return changed


def collect(sub, exts):
    out = []
    for dp, _, fs in os.walk(os.path.join(ROOT, sub)):
        for f in fs:
            if f.endswith(exts) and not f.endswith('.spec.ts'):
                out.append(os.path.join(dp, f).replace(os.sep, '/'))
    return out


print('--- variables.scss ---')
for proj, note in (('cosmos-front', 'Panel administrativo (web).'),
                   ('cosmos-app', 'Aplicacion movil de marcaciones.')):
    p = f'{ROOT}/{proj}/src/styles/variables.scss'
    io.open(p, 'w', encoding='utf-8').write(build_variables(note))
    print(f'  reescrito: {proj}/src/styles/variables.scss')

print('\n--- tailwind.config.js ---')
for proj in ('cosmos-front', 'cosmos-app'):
    ok, msg = patch_tailwind(f'{ROOT}/{proj}/tailwind.config.js')
    print(f'  {proj}: {msg}')

print('\n--- literales incrustados ---')
files = (collect('cosmos-front/src', ('.html', '.scss', '.ts')) +
         collect('cosmos-app/src', ('.html', '.scss', '.ts')) +
         collect('cosmos-back/src', ('.ts',)))
for rel, nhex, rgba_changed in patch_literals(files):
    bits = []
    if nhex: bits.append(f'{nhex} hex')
    if rgba_changed: bits.append('rgba')
    print(f'  {rel}  ({", ".join(bits)})')
