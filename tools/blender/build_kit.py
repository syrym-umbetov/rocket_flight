"""Кит деталей ракеты для игры: Blender → public/models/rocket-kit.glb.

Запуск:  blender --background --python tools/blender/build_kit.py

Соглашения, обязательные для сборки в three.js:
  * начало координат каждой детали — её ВЕРХНЯЯ точка, деталь уходит вниз по −Z;
    экспортёр переводит Z-up в Y-up, поэтому в three.js деталь уходит по −Y —
    ровно так, как её ставит layout() из src/lib/design.ts;
  * радиусы в метрах, калибр 3 м, как в DIAMETER;
  * детали переменной длины (обечайки баков) сделаны единичными: игра тянет их
    масштабом по Y, а накладные элементы — шпангоуты, полосы — ставит отдельно,
    чтобы растяжение их не искажало.
"""
import bpy, bmesh, math, os, sys

R = 1.5
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models', 'rocket-kit.glb')

# ------------------------------------------------------------------ утилиты

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, metallic=0.0, rough=0.45):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    return m

def lathe(name, profile, material, segments=48, smooth=True):
    """Тело вращения по профилю [(радиус, z), ...]; z обычно отрицательный."""
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    vs = [bm.verts.new((max(p[0], 1e-4), 0.0, p[1])) for p in profile]
    for a, b in zip(vs, vs[1:]):
        bm.edges.new((a, b))
    bm.to_mesh(me); bm.free()
    sc = ob.modifiers.new('screw', 'SCREW')
    sc.axis = 'Z'; sc.angle = 2 * math.pi
    sc.steps = segments; sc.render_steps = segments
    sc.use_merge_vertices = True; sc.use_normal_calculate = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='screw')
    ob.data.materials.append(material)
    if smooth:
        bpy.ops.object.shade_smooth(use_auto_smooth=True, auto_smooth_angle=math.radians(35))
    return ob

def zero_origin(ob):
    """Переносит смещение объекта в саму геометрию: начало координат детали — (0,0,0)."""
    from mathutils import Matrix
    ob.data.transform(Matrix.Translation(ob.location))
    ob.location = (0, 0, 0)
    return ob

def join(name, objs, material=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    ob.data.name = name
    return zero_origin(ob)

def ogive(length, radius, steps=24):
    """Оживало: кончик в (0,0), основание радиуса `radius` на z=-length."""
    rho = (radius ** 2 + length ** 2) / (2 * radius)
    pts = []
    for i in range(steps + 1):
        depth = length * (i / steps)
        r = math.sqrt(max(rho ** 2 - (length - depth) ** 2, 0)) - (rho - radius)
        pts.append((max(r, 0.0), -depth))
    return pts

def blunt(length, radius, steps=16):
    """Затупленный: крутое нарастание у кончика."""
    return [(radius * math.sqrt(max(1 - (1 - i / steps) ** 2, 0)), -length * (i / steps))
            for i in range(steps + 1)]

def bell(exit_r, length, throat=0.3, steps=16):
    return [(throat + (exit_r - throat) * ((i / steps) ** 0.62), -length * (i / steps))
            for i in range(steps + 1)]

reset()
M_WHITE  = mat('paint_white',  (0.88, 0.89, 0.91), 0.0, 0.38)
M_DARK   = mat('paint_dark',   (0.08, 0.09, 0.11), 0.15, 0.42)
M_ORANGE = mat('paint_orange', (0.74, 0.28, 0.09), 0.0, 0.50)
M_METAL  = mat('metal',        (0.55, 0.57, 0.60), 0.92, 0.30)
M_NOZZLE = mat('nozzle',       (0.34, 0.32, 0.31), 1.00, 0.35)

kit = []

# ------------------------------------------------------------- обтекатели
# длины совпадают с NOSES в src/lib/parts.ts
kit.append(lathe('nose_ogive', ogive(6.5, R), M_WHITE))
kit.append(lathe('nose_cone', [(0.0, 0.0), (R, -5.5)], M_WHITE))
kit.append(lathe('nose_blunt', blunt(3.5, R), M_WHITE))
kit.append(lathe('nose_flat', [(R * 0.97, 0.0), (R, -1.0)], M_WHITE, smooth=False))

# ------------------------------------------------------------- обечайки
# единичная длина: игра растягивает масштабом
kit.append(lathe('tube_unit', [(R, 0.0), (R, -1.0)], M_WHITE, smooth=True))
kit.append(lathe('tube_unit_dark', [(R, 0.0), (R, -1.0)], M_DARK, smooth=True))

# накладные элементы фиксированной высоты
kit.append(lathe('frame_ring', [(R, 0.0), (R * 1.012, -0.02), (R * 1.012, -0.14), (R, -0.16), (R, 0.0)],
                 M_DARK, smooth=False))
kit.append(lathe('band_ring', [(R * 1.002, 0.0), (R * 1.014, -0.05), (R * 1.014, -0.95),
                               (R * 1.002, -1.0), (R * 1.002, 0.0)], M_ORANGE, smooth=False))
kit.append(lathe('cable_duct', [(0.17, 0.0), (0.17, -1.0)], M_DARK, 12, False))

# ------------------------------------------------------------- переходный отсек
inter = [lathe('interstage_shell', [(R * 0.99, 0.0), (R * 0.99, -2.0)], M_DARK)]
for i in range(16):
    a = 2 * math.pi * i / 16
    s = lathe(f'st{i}', [(0.055, -0.12), (0.055, -1.88)], M_METAL, 6, False)
    s.location = (math.cos(a) * R * 0.92, math.sin(a) * R * 0.92, 0)
    inter.append(s)
kit.append(join('interstage', inter))

# ------------------------------------------------------------- хвостовые отсеки
kit.append(lathe('skirt_s1', [(R, 0.0), (R * 0.93, -1.65), (R * 0.93, -1.85)], M_METAL))
kit.append(lathe('skirt_s2', [(R * 0.985, 0.0), (R * 0.86, -1.65), (R * 0.86, -1.8)], M_DARK))

# ------------------------------------------------------------- сопло
# единичное: радиус среза 1, длина 1 — игра масштабирует под конкретный двигатель
noz = [lathe('bell', bell(1.0, 1.0, 0.3), M_NOZZLE)]
for i in range(24):                       # трубки регенеративного охлаждения
    a = 2 * math.pi * i / 24
    t = lathe(f'c{i}', [(0.035, -0.02), (0.035, -0.62)], M_METAL, 5, False)
    rr = 0.3 + (1.0 - 0.3) * (0.62 ** 0.62)
    t.location = (math.cos(a) * rr * 0.82, math.sin(a) * rr * 0.82, 0)
    noz.append(t)
kit.append(join('nozzle_unit', noz))

# ------------------------------------------------------------- стабилизаторы
def fin(name, span, chord, thick, swept, material):
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    if swept:
        root = [(0, 0), (0, -chord), (span, -chord * 0.95), (span, -chord * 0.35)]
    else:
        root = [(0, 0), (0, -chord), (span, -chord * 0.8), (span, -chord * 0.15)]
    vs = [bm.verts.new((x, 0, y)) for x, y in root]
    f = bm.faces.new(vs)
    bmesh.ops.solidify(bm, geom=[f], thickness=thick)
    bm.to_mesh(me); bm.free()
    ob.data.materials.append(material)
    m = ob.modifiers.new('bev', 'BEVEL')
    m.width = min(thick * 0.4, 0.06); m.segments = 2
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='bev')
    return ob

# размеры из FINS в src/lib/parts.ts
kit.append(fin('fin_small', 1.3, 2.6, 0.12, False, M_ORANGE))
kit.append(fin('fin_large', 2.4, 3.6, 0.16, True, M_ORANGE))

# решётчатый стабилизатор: рамка с внутренней сеткой
def grid_fin(name, span=1.8, chord=2.2, cells=5):
    plates = []
    for i in range(cells + 1):
        t = i / cells
        p = lathe(f'g_h{i}', [(0.03, -chord * t - 0.001), (0.03, -chord * t)], M_METAL, 4, False)
        bpy.ops.mesh.primitive_cube_add(size=1)
        c = bpy.context.active_object
        c.scale = (span / 2, 0.35, 0.022)
        c.location = (span / 2, 0, -chord * t)
        bpy.ops.object.transform_apply(scale=True)
        c.data.materials.append(M_METAL)
        plates.append(c)
        bpy.data.objects.remove(p, do_unlink=True)
    for i in range(4):
        x = span * (i + 0.5) / 4
        bpy.ops.mesh.primitive_cube_add(size=1)
        c = bpy.context.active_object
        c.scale = (0.022, 0.35, chord / 2)
        c.location = (x, 0, -chord / 2)
        bpy.ops.object.transform_apply(scale=True)
        c.data.materials.append(M_METAL)
        plates.append(c)
    return join(name, plates)

kit.append(grid_fin('fin_grid'))

# ------------------------------------------------------------- экспорт
for o in bpy.context.scene.objects:
    o.select_set(False)
for o in kit:
    zero_origin(o)
    o.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT), export_format='GLB',
                          use_selection=True, export_yup=True, export_apply=True)
tris = sum(len(o.data.polygons) for o in kit if o.type == 'MESH')
print(f'КИТ: {len(kit)} деталей, {tris} полигонов, {os.path.getsize(os.path.abspath(OUT))/1024:.0f} КБ')
print('ДЕТАЛИ: ' + ', '.join(o.name for o in kit))
