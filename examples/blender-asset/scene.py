# Small editable asset. Validation/reopening/export/render belong to a separate trusted process.
import bpy, os, sys
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
output=args[args.index('--output')+1]
if output!='/workspace/output':raise RuntimeError('Sandbox output required')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.035,0.05,0.08,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.5

def mat(name,color,metal=0.0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=color;p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=0.3;return m
bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=0.65,depth=0.25,location=(0,0,0.125));base=bpy.context.object;base.name='BeaconBase';base.data.materials.append(mat('Metal',(0.08,0.15,0.28,1),0.6));bevel=base.modifiers.new('Rounded','BEVEL');bevel.width=0.06;bevel.segments=3
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=0.4,location=(0,0,0.55));orb=bpy.context.object;orb.name='BeaconOrb';orb.data.materials.append(mat('Emerald',(0.2,0.8,0.5,1),0.2))
for polygon in orb.data.polygons:polygon.use_smooth=True
bpy.ops.object.light_add(type='AREA',location=(2,-3,4));bpy.context.object.data.energy=600;bpy.context.object.data.size=4
bpy.ops.object.camera_add(location=(2.6,-3.2,2));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,0.4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=55;scene.camera=camera
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(output,'source.blend'),compress=False)
