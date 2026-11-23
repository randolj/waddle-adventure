using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Waddle;

public static class SliceBuilder {
    public const string ScenePath="Assets/Waddle/Scenes/Frostvault.unity";
    [MenuItem("Waddle/Build or refresh slice scene")]
    public static void CreateScene() {
        Directory.CreateDirectory("Assets/Waddle/Scenes"); Directory.CreateDirectory("Assets/Waddle/Generated");
        AssetDatabase.Refresh();
        var tuning=AssetDatabase.LoadAssetAtPath<SliceTuning>("Assets/Waddle/SliceTuning.asset");
        if(!tuning) { tuning=ScriptableObject.CreateInstance<SliceTuning>(); AssetDatabase.CreateAsset(tuning,"Assets/Waddle/SliceTuning.asset"); }
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        SliceWorld.ResetConstructionCache();
        var root=new GameObject("Waddle's Quest · vertical slice"); var game=root.AddComponent<SliceGame>(); game.tuning=tuning;
        game.BuildScene();
        game.effectMaterial=(Material)Save(SliceEffects.CreateGlowMaterial(Color.white),"mat");
        var stoneTexture=AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Waddle/Textures/slate-albedo.png");
        var textured=new System.Collections.Generic.HashSet<Material>();
        foreach(var renderer in root.GetComponentsInChildren<Renderer>(true)) {
            string n=renderer.gameObject.name;
            if(!(n.Contains("wall")||n.Contains("masonry")||n.Contains("Slate")||n=="Plinth"||n=="Capital"||n.Contains("jamb")||n.Contains("lintel"))) continue;
            foreach(var material in renderer.sharedMaterials) {
                if(!textured.Add(material)) continue;
                material.SetTexture("_BaseMap",stoneTexture); var color=material.color; color*=2.25f; color.a=1; material.color=color;
            }
        }
        // Runtime-authored meshes and materials become real project assets, visible before pressing Play.
        foreach(var renderer in root.GetComponentsInChildren<Renderer>(true))
            renderer.sharedMaterials=renderer.sharedMaterials.Select(m=>(Material)Save(m,"mat")).ToArray();
        foreach(var filter in root.GetComponentsInChildren<MeshFilter>(true)) {
            if(filter.sharedMesh && !AssetDatabase.Contains(filter.sharedMesh) && filter.sharedMesh.name!="Cube" && filter.sharedMesh.name!="Sphere" && filter.sharedMesh.name!="Cylinder") filter.sharedMesh=(Mesh)Save(filter.sharedMesh,"asset");
        }
        foreach(var volume in root.GetComponentsInChildren<Volume>(true)) {
            if(!volume.sharedProfile || AssetDatabase.Contains(volume.sharedProfile)) continue;
            string path="Assets/Waddle/Generated/"+volume.sharedProfile.name.Replace(" ","_")+".asset";
            if(AssetDatabase.LoadAssetAtPath<VolumeProfile>(path)) AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(volume.sharedProfile,path);
            foreach(var component in volume.sharedProfile.components) AssetDatabase.AddObjectToAsset(component,volume.sharedProfile);
        }
        var pipeline=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Settings/PC_RPAsset.asset");
        QualitySettings.SetQualityLevel(1); QualitySettings.renderPipeline=pipeline; GraphicsSettings.defaultRenderPipeline=pipeline;
        PlayerSettings.companyName="Waddle"; PlayerSettings.productName="Waddle's Quest — Frostvault";
        PlayerSettings.defaultScreenWidth=1440; PlayerSettings.defaultScreenHeight=900; PlayerSettings.fullScreenMode=FullScreenMode.Windowed;
        PlayerSettings.resizableWindow=true; PlayerSettings.runInBackground=true; PlayerSettings.colorSpace=ColorSpace.Linear;
        EditorSceneManager.MarkSceneDirty(scene); EditorSceneManager.SaveScene(scene,ScenePath);
        EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
        AssetDatabase.SaveAssets();
        Debug.Log("WADDLE_SCENE_READY " + ScenePath);
    }
    static Object Save(Object obj,string extension) {
        if(!obj || AssetDatabase.Contains(obj)) return obj;
        var safe=new string(obj.name.Select(c=>char.IsLetterOrDigit(c)||c=='_'?c:'_').ToArray());
        string path="Assets/Waddle/Generated/"+safe+"."+extension;
        var existing=AssetDatabase.LoadMainAssetAtPath(path);
        if(existing) { EditorUtility.CopySerialized(obj,existing); EditorUtility.SetDirty(existing); return existing; }
        AssetDatabase.CreateAsset(obj,path); return obj;
    }
    [MenuItem("Waddle/Install normalized Tripo models")]
    public static void InstallTripoModels() {
        Directory.CreateDirectory("Assets/Waddle/Prefabs"); AssetDatabase.Refresh();
        var tuning=AssetDatabase.LoadAssetAtPath<SliceTuning>("Assets/Waddle/SliceTuning.asset");
        if(!tuning) throw new System.Exception("Create the slice scene before installing models.");
        foreach(string name in new[]{"drifter","sword","gremlin","charger"}) {
            string path="Assets/Waddle/Models/"+name+"/"+name+".fbx";
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if(!source) throw new System.Exception("Missing normalized model: "+path);
            var root=new GameObject(name+" · Tripo model");
            var model=(GameObject)PrefabUtility.InstantiatePrefab(source); model.transform.SetParent(root.transform,false);
            if(name=="sword") model.transform.localRotation=Quaternion.Euler(90,0,0);
            foreach(var renderer in model.GetComponentsInChildren<Renderer>(true)) {
                var converted=renderer.sharedMaterials.Select(old=> {
                    string materialPath="Assets/Waddle/Models/"+name+"/"+old.name.Replace('/','_')+"_URP.mat";
                    var material=AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                    if(!material) {
                        material=new Material(Shader.Find("Universal Render Pipeline/Lit"));
                        material.color=old.HasProperty("_Color")?old.color:Color.white;
                        string textureRoot="Assets/Waddle/Models/"+name+"/textures/";
                        var albedo=AssetDatabase.LoadAssetAtPath<Texture2D>(textureRoot+"basecolor.png");
                        if(!albedo) albedo=AssetDatabase.LoadAssetAtPath<Texture2D>(textureRoot+"basecolor.jpg");
                        material.SetTexture("_BaseMap",albedo?albedo:old.mainTexture);
                        string normalPath=textureRoot+"normal.png";
                        var importer=AssetImporter.GetAtPath(normalPath) as TextureImporter;
                        if(importer) { importer.textureType=TextureImporterType.NormalMap; importer.SaveAndReimport(); }
                        var normal=AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath);
                        if(normal) { material.SetTexture("_BumpMap",normal); material.EnableKeyword("_NORMALMAP"); }
                        material.SetFloat("_Smoothness",.22f); material.EnableKeyword("_EMISSION");
                        if(name=="sword") material.SetColor("_EmissionColor",new Color(.04f,.28f,.36f));
                        AssetDatabase.CreateAsset(material,materialPath);
                    }
                    return material;
                }).ToArray();
                renderer.sharedMaterials=converted;
            }
            var prefab=PrefabUtility.SaveAsPrefabAsset(root,"Assets/Waddle/Prefabs/"+name+".prefab");
            Object.DestroyImmediate(root);
            if(name=="drifter") tuning.drifterModel=prefab;
            if(name=="sword") tuning.swordModel=prefab;
            if(name=="gremlin") tuning.gremlinModel=prefab;
            if(name=="charger") tuning.chargerModel=prefab;
        }
        EditorUtility.SetDirty(tuning); AssetDatabase.SaveAssets(); CreateScene();
        Debug.Log("WADDLE_TRIPO_INSTALLED");
    }
    [MenuItem("Waddle/Build macOS slice")]
    public static void BuildMac() {
        if(!File.Exists(ScenePath)) CreateScene();
        Directory.CreateDirectory("Builds");
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{
            scenes=new[]{ScenePath}, locationPathName="Builds/WaddlesQuest.app", target=BuildTarget.StandaloneOSX,
            options=BuildOptions.None
        });
        if(report.summary.result!=BuildResult.Succeeded) throw new System.Exception("Waddle build failed: "+report.summary.result);
        Debug.Log("WADDLE_BUILD_OK "+report.summary.totalSize+" bytes");
    }
    public static void RefreshAndBuild() {
        CreateScene();
        var used=new System.Collections.Generic.HashSet<string>(AssetDatabase.GetDependencies(ScenePath,true));
        foreach(string path in Directory.GetFiles("Assets/Waddle/Generated"))
            if(!path.EndsWith(".meta") && !used.Contains(path)) AssetDatabase.DeleteAsset(path);
        BuildMac();
    }
}
