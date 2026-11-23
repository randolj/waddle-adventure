"""Run with Blender in background to turn downloaded Tripo GLBs into Unity FBX assets.

blender --background --python scripts/prepare_tripo_models.py
Preserves raw GLBs; normalizes size, feet pivot, forward axis and external textures.
"""
from pathlib import Path
import math
import json
import struct
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
HEIGHTS = {'drifter': 1.5, 'gremlin': 1.2, 'charger': 2.0, 'sword': 1.35}

for name, height in HEIGHTS.items():
    source = ROOT / 'art-src/tripo-models' / (name + '.glb')
    if not source.exists():
        continue
    output = ROOT / 'unity/Assets/Waddle/Models' / name
    if (output / (name + '.fbx')).exists() and (output / 'textures/basecolor.png').exists():
        print('Retained existing normalized model: ' + name)
        continue
    textures = output / 'textures'
    textures.mkdir(parents=True, exist_ok=True)
    # Extract original GLB image bytes unchanged; Blender defers loading packed images.
    blob=source.read_bytes()
    json_size=struct.unpack_from('<I',blob,12)[0]
    document=json.loads(blob[20:20+json_size])
    binary=blob[28+json_size:]
    mat=document['materials'][0]
    maps={'basecolor':mat['pbrMetallicRoughness'].get('baseColorTexture'),
          'normal':mat.get('normalTexture'),
          'metallicroughness':mat['pbrMetallicRoughness'].get('metallicRoughnessTexture')}
    for label,texture in maps.items():
        if texture is None:
            continue
        image=document['images'][document['textures'][texture['index']]['source']]
        view=document['bufferViews'][image['bufferView']]
        suffix='.png' if image['mimeType']=='image/png' else '.jpg'
        start=view.get('byteOffset',0)
        (textures/(label+suffix)).write_bytes(binary[start:start+view['byteLength']])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    # Tripo exports +X forward. Blender's conventional character forward is -Y.
    root.rotation_euler.z = -math.pi / 2
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
    lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    factor = height / (hi.z - lo.z)
    root.scale = (factor,) * 3
    root.location = (-(hi.x+lo.x)*.5*factor, -(hi.y+lo.y)*.5*factor, -lo.z*factor)
    bpy.context.view_layer.update()
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type!='TEX_IMAGE' or not node.image:
                continue
            label='normal' if 'Normal' in node.image.name else 'basecolor' if 'Color' in node.image.name else None
            if label:
                files=list(textures.glob(label+'.*'))
                if files:
                    node.image=bpy.data.images.load(str(files[0]),check_existing=True)
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.ops.export_scene.fbx(filepath=str(output / (name + '.fbx')), use_selection=True,
        object_types={'MESH','EMPTY','ARMATURE'}, axis_forward='-Z', axis_up='Y',
        apply_unit_scale=True, bake_space_transform=False, add_leaf_bones=False,
        path_mode='COPY', embed_textures=False, bake_anim=False)
    triangles = sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)
    print(f'WADDLE_MODEL_READY {name} {triangles} triangles, target height {height}m')
