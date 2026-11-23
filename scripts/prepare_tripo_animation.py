"""Blender background import/export of Tripo skeletal GLBs, preserving weights and clips.

Run after downloading animation results. Raw GLBs remain untouched.
"""
from pathlib import Path
import json
import math
import struct
import argparse
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]


def prepare(name,height):
    source=ROOT/'art-src/tripo-models/animation'/f'{name}-clips.glb'
    if not source.exists():
        return
    output=ROOT/'unity/Assets/Waddle/Models'/f'{name}-skeletal'
    textures=output/'textures'
    textures.mkdir(parents=True,exist_ok=True)
    raw=source.read_bytes()
    size=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+size]); binary=raw[28+size:]
    material=document['materials'][0]
    maps={'basecolor':material['pbrMetallicRoughness'].get('baseColorTexture'),
          'normal':material.get('normalTexture')}
    for label,entry in maps.items():
        if entry is None:
            continue
        image=document['images'][document['textures'][entry['index']]['source']]
        view=document['bufferViews'][image['bufferView']]
        suffix='.png' if image['mimeType']=='image/png' else '.jpg'
        start=view.get('byteOffset',0)
        (textures/(label+suffix)).write_bytes(binary[start:start+view['byteLength']])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    # Rigging output includes a hidden unskinned Icosphere helper. It is not part of
    # the character: exclude it before computing dimensions and exporting.
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH' and not any(m.type=='ARMATURE' for m in obj.modifiers):
            bpy.data.objects.remove(obj,do_unlink=True)
    root=bpy.data.objects.new(name+'_Skeletal',None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj!=root and obj.parent is None:
            obj.parent=root
    root.rotation_euler.z=-math.pi/2
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    if not rigs or not any(o.vertex_groups for o in meshes):
        raise RuntimeError('Downloaded asset has no usable skeletal skin.')
    # Tripo can leave tiny isolated detail islands unweighted. Bind these to the nearest
    # bone segment rather than letting vertices remain behind when the character moves.
    repaired=0
    for mesh in meshes:
        rig=next((m.object for m in mesh.modifiers if m.type=='ARMATURE'),rigs[0])
        for vertex in mesh.data.vertices:
            if any(g.weight>0 for g in vertex.groups):
                continue
            point=mesh.matrix_world@vertex.co
            def distance(bone):
                head=rig.matrix_world@bone.head_local; tail=rig.matrix_world@bone.tail_local
                segment=tail-head
                t=max(0,min(1,(point-head).dot(segment)/max(segment.length_squared,1e-12)))
                return (point-head-segment*t).length_squared
            bone=min(rig.data.bones,key=distance)
            group=mesh.vertex_groups.get(bone.name) or mesh.vertex_groups.new(name=bone.name)
            group.add([vertex.index],1.0,'REPLACE'); repaired+=1
    # Use undeformed mesh vertices, so normalization is independent of the currently selected action.
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    scale=height/(hi.z-lo.z)
    root.scale=(scale,)*3
    root.location=(-(hi.x+lo.x)*.5*scale,-(hi.y+lo.y)*.5*scale,-lo.z*scale)
    bpy.context.view_layer.update()
    for mat in bpy.data.materials:
        if not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type!='TEX_IMAGE' or not node.image:
                continue
            label='normal' if 'Normal' in node.image.name else 'basecolor' if 'Color' in node.image.name else None
            if label:
                files=list(textures.glob(label+'.*'))
                if files:
                    node.image=bpy.data.images.load(str(files[0]),check_existing=True)
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.ops.export_scene.fbx(filepath=str(output/(name+'-skeletal.fbx')),use_selection=True,
        object_types={'MESH','ARMATURE','EMPTY'},axis_forward='-Z',axis_up='Y',
        apply_unit_scale=True,add_leaf_bones=False,path_mode='COPY',embed_textures=False,
        bake_anim=True,bake_anim_use_all_actions=True,bake_anim_use_nla_strips=False,
        bake_anim_simplify_factor=0)
    report={'repaired_unweighted_vertices':repaired,'name':name,'height':height,'bones':[b.name for rig in rigs for b in rig.data.bones],
            'actions':[a.name for a in bpy.data.actions],
            'weighted_vertices':sum(sum(1 for v in o.data.vertices if v.groups) for o in meshes),
            'vertices':sum(len(o.data.vertices) for o in meshes)}
    (output/'rig-audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print('WADDLE_SKELETAL_EXPORT '+json.dumps(report))


parser=argparse.ArgumentParser()
parser.add_argument('--only',choices=('drifter','charger','gremlin'))
# Blender arguments follow --; its own flags belong to Blender.
import sys
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
for name,height in [('drifter',1.5),('charger',2.0),('gremlin',1.2)]:
    if args.only is None or args.only==name:
        prepare(name,height)
