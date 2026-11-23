using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using Waddle;

public static class SkeletonBuilder {
    [MenuItem("Waddle/Install skeletal characters")]
    public static void Install() {
        AssetDatabase.Refresh();
        var tuning=AssetDatabase.LoadAssetAtPath<SliceTuning>("Assets/Waddle/SliceTuning.asset");
        if(!tuning) throw new Exception("Missing slice tuning.");
        foreach(string name in new[]{"drifter","charger","gremlin"}) {
            string directory="Assets/Waddle/Models/"+name+"-skeletal";
            string path=directory+"/"+name+"-skeletal.fbx";
            if(!File.Exists(path)) { if(name=="drifter") throw new Exception("Missing Waddle skeleton."); continue; }
            var importer=(ModelImporter)AssetImporter.GetAtPath(path);
            importer.animationType=ModelImporterAnimationType.Generic; importer.importAnimation=true;
            importer.avatarSetup=ModelImporterAvatarSetup.CreateFromThisModel; importer.preserveHierarchy=true;
            importer.optimizeGameObjects=false; importer.animationCompression=ModelImporterAnimationCompression.Off;
            importer.SaveAndReimport();
            var clips=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c=>!c.name.StartsWith("__preview")).ToArray();
            Debug.Log("WADDLE_CLIPS "+name+": "+string.Join(", ",clips.Select(c=>c.name+" "+c.length)));
            AnimationClip Find(string token,bool required=true) {
                var found=clips.FirstOrDefault(c=>c.name.ToLowerInvariant().Contains(token));
                if(!found && required) throw new Exception("Missing "+token+" in "+path);
                return found;
            }
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);
            var root=new GameObject(name+" · skeletal");
            var model=(GameObject)PrefabUtility.InstantiatePrefab(source); model.transform.SetParent(root.transform,false);
            var animator=model.GetComponent<Animator>(); if(!animator) animator=model.AddComponent<Animator>();
            animator.applyRootMotion=false; animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
            var skeleton=root.AddComponent<SliceSkeleton>(); skeleton.animator=animator; skeleton.walk=Find("walk");
            skeleton.penguinWaddle=name=="drifter";
            skeleton.nominalSpeed=name=="drifter"?5:name=="gremlin"?2.1f:1.4f;
            skeleton.strideDistance=name=="drifter"?2.2f:name=="gremlin"?1.35f:1.1f;
            skeleton.bodyWobble=name=="charger"?2.2f:0;
            skeleton.walkStart=name=="gremlin"?0:.04f; skeleton.walkEnd=name=="drifter"?1.2f:name=="charger"?.915f:0;
            var bones=model.GetComponentsInChildren<Transform>(true);
            skeleton.hips=bones.FirstOrDefault(t=>t.name.EndsWith("Hips",StringComparison.Ordinal));
            skeleton.torso=bones.FirstOrDefault(t=>t.name.EndsWith(name=="drifter"?"Spine":"Spine_1",StringComparison.Ordinal)) ?? bones.FirstOrDefault(t=>t.name.EndsWith("Spine_0",StringComparison.Ordinal));
            skeleton.creatureHead=bones.FirstOrDefault(t=>t.name.EndsWith("Head_0",StringComparison.Ordinal));
            if(!skeleton.torso || (name!="drifter" && !skeleton.creatureHead)) throw new Exception("Missing reaction bones in "+name);
            if(name=="drifter") {
                skeleton.idle=Find("idle"); skeleton.slash=Find("slash"); skeleton.dash=Find("dive"); skeleton.hurt=Find("hurt");
                skeleton.rightHand=model.GetComponentsInChildren<Transform>(true).FirstOrDefault(t=>t.name.EndsWith("RightHand",StringComparison.Ordinal));
                if(!skeleton.rightHand) throw new Exception("No right-hand bone for sword socket.");
            }
            var ik=root.AddComponent<SliceFootIK>();
            Transform Bone(string suffix) => bones.FirstOrDefault(t=>t.name.EndsWith(suffix,StringComparison.Ordinal));
            SliceFootIK.Leg Leg(string u,string l,string f,float phase,float outward=0) => new SliceFootIK.Leg {
                upper=Bone(u),lower=Bone(l),foot=Bone(f),phaseOffset=phase,outward=outward
            };
            if(name=="drifter") {
                ik.legs=new[]{Leg("LeftUpLeg","LeftLeg","LeftFoot",0),Leg("RightUpLeg","RightLeg","RightFoot",.5f)};
                ik.maxCorrection=.065f; ik.maxStep=.09f;
            } else if(name=="charger") {
                ik.legs=new[]{Leg("0_Left_Limb_0","0_Left_Limb_1","0_Left_Limb_2",0,.12f),Leg("0_Right_Limb_0","0_Right_Limb_1","0_Right_Limb_2",.5f,.12f),
                    Leg("1_Left_Limb_0","1_Left_Limb_1","1_Left_Limb_2",.5f,.12f),Leg("1_Right_Limb_0","1_Right_Limb_1","1_Right_Limb_2",0,.12f)};
            } else {
                // The gremlin's front pair are hands; only its supporting rear feet are grounded.
                ik.legs=new[]{Leg("1_Left_Limb_0","1_Left_Limb_1","1_Left_Limb_2",0),Leg("1_Right_Limb_0","1_Right_Limb_1","1_Right_Limb_2",.5f)};
                ik.maxCorrection=.12f; ik.maxStep=.13f;
            }
            if(ik.legs.Any(l=>!l.upper || !l.lower || !l.foot)) throw new Exception("Missing IK leg chain in "+name);
            var materialPath=directory+"/Skeletal_URP.mat";
            var material=AssetDatabase.LoadAssetAtPath<Material>(materialPath);
            if(!material) { material=new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(material,materialPath); }
            material.color=Color.white; material.SetFloat("_Smoothness",.22f); material.EnableKeyword("_EMISSION");
            var texture=AssetDatabase.LoadAssetAtPath<Texture2D>(directory+"/textures/basecolor.png");
            if(!texture) texture=AssetDatabase.LoadAssetAtPath<Texture2D>(directory+"/textures/basecolor.jpg");
            if(!texture) throw new Exception("Skeletal model is missing base color texture."); material.SetTexture("_BaseMap",texture);
            var normalPath=directory+"/textures/normal.png"; var normalImporter=AssetImporter.GetAtPath(normalPath) as TextureImporter;
            if(normalImporter) {
                normalImporter.textureType=TextureImporterType.NormalMap; normalImporter.SaveAndReimport();
                material.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath)); material.EnableKeyword("_NORMALMAP");
            }
            EditorUtility.SetDirty(material);
            foreach(var renderer in model.GetComponentsInChildren<SkinnedMeshRenderer>(true)) {
                renderer.sharedMaterials=renderer.sharedMaterials.Select(_=>material).ToArray(); renderer.updateWhenOffscreen=true;
            }
            if(!model.GetComponentsInChildren<SkinnedMeshRenderer>().Any(s=>s.bones.Length>10)) throw new Exception("No usable skinned mesh in "+name);
            var prefab=PrefabUtility.SaveAsPrefabAsset(root,"Assets/Waddle/Prefabs/"+name+"-skeletal.prefab");
            UnityEngine.Object.DestroyImmediate(root);
            if(name=="drifter") tuning.drifterModel=prefab; else if(name=="charger") tuning.chargerModel=prefab; else tuning.gremlinModel=prefab;
        }
        EditorUtility.SetDirty(tuning); AssetDatabase.SaveAssets(); SliceBuilder.CreateScene();
        Debug.Log("WADDLE_SKELETONS_INSTALLED");
    }
    public static void InstallAndBuild() { Install(); SliceBuilder.BuildMac(); }
}
