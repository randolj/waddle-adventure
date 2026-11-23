using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Waddle {
    // Scene construction stays independent of combat. Generated assets are saved by SliceBuilder.
    public static class SliceWorld {
        public static readonly Color Cyan = new Color(.12f, .85f, 1f);
        static readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        static Mesh stoneMesh, crystalMesh;
        public static void ResetConstructionCache() { materials.Clear(); stoneMesh=null; crystalMesh=null; SliceDressing.Reset(); }
        public static Material Material(Color color, bool glow = false) {
            string key = ColorUtility.ToHtmlStringRGBA(color) + glow;
            if (materials.TryGetValue(key, out var found) && found) return found;
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.name = "Waddle_" + key; m.color = color;
            m.EnableKeyword("_EMISSION");
            m.SetFloat("_Smoothness", glow ? .38f : .15f);
            if (glow) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", color * .8f); }
            materials[key] = m; return m;
        }
        public static GameObject Shape(string name, PrimitiveType type, Transform parent, Vector3 position, Vector3 scale, Material material, bool solid = false) {
            var go = GameObject.CreatePrimitive(type); go.name = name;
            go.transform.SetParent(parent, false); go.transform.localPosition = position; go.transform.localScale = scale;
            go.GetComponent<Renderer>().sharedMaterial = material;
            var collider = go.GetComponent<Collider>();
            if (!solid) { collider.enabled = false; if (Application.isPlaying) Object.Destroy(collider); else Object.DestroyImmediate(collider); }
            else go.layer = 6;
            return go;
        }
        public static Transform Group(string name, Transform parent, Vector3 position) {
            var t = new GameObject(name).transform; t.SetParent(parent, false); t.localPosition = position; return t;
        }
        static void Face(List<Vector3> vertices, List<int> indices, params Vector3[] points) {
            Vector3 center = Vector3.zero; foreach (var p in points) center += p;
            if (Vector3.Dot(Vector3.Cross(points[1] - points[0], points[2] - points[0]), center) < 0) System.Array.Reverse(points);
            int n = vertices.Count; vertices.AddRange(points);
            for (int i = 1; i < points.Length - 1; i++) { indices.Add(n); indices.Add(n + i); indices.Add(n + i + 1); }
        }
        static Mesh StoneMesh() {
            if (stoneMesh) return stoneMesh;
            var v = new List<Vector3>(); var t = new List<int>(); const float a = .5f, b = .48f;
            for (int axis = 0; axis < 3; axis++) for (int sign = -1; sign <= 1; sign += 2) {
                var p = new Vector3[4]; int index = 0;
                foreach (var pair in new[] {new Vector2(-1,-1),new Vector2(1,-1),new Vector2(1,1),new Vector2(-1,1)}) {
                    var q = Vector3.zero; q[axis] = sign * a; q[(axis+1)%3] = pair.x*b; q[(axis+2)%3] = pair.y*b; p[index++] = q;
                }
                Face(v,t,p);
            }
            for (int axis = 0; axis < 3; axis++) for (int s = -1; s <= 1; s += 2) for (int u = -1; u <= 1; u += 2) {
                int j = (axis+1)%3, k = (axis+2)%3;
                var p = new Vector3[4];
                for (int n = 0; n < 4; n++) {
                    var q = Vector3.zero; q[axis] = n < 2 ? -b : b;
                    q[j] = s * (n == 0 || n == 3 ? a : b); q[k] = u * (n == 0 || n == 3 ? b : a); p[n] = q;
                }
                Face(v,t,p);
            }
            for (int x = -1; x <= 1; x += 2) for (int y = -1; y <= 1; y += 2) for (int z = -1; z <= 1; z += 2)
                Face(v,t,new Vector3(x*a,y*b,z*b),new Vector3(x*b,y*a,z*b),new Vector3(x*b,y*b,z*a));
            stoneMesh = new Mesh { name = "Bevelled stone" }; stoneMesh.SetVertices(v); stoneMesh.SetTriangles(t,0);
            stoneMesh.RecalculateNormals(); stoneMesh.RecalculateBounds();
            var uv=new Vector2[v.Count]; var normals=stoneMesh.normals;
            for(int i=0;i<v.Count;i++) {
                var n=normals[i]; var p=v[i];
                uv[i]=Mathf.Abs(n.y)>.7f?new Vector2(p.x+.5f,p.z+.5f):Mathf.Abs(n.x)>.7f?new Vector2(p.z+.5f,p.y+.5f):new Vector2(p.x+.5f,p.y+.5f);
            }
            stoneMesh.uv=uv; return stoneMesh;
        }
        static GameObject Stone(string name, Transform parent, Vector3 pos, Vector3 scale, Material m, bool solid = true) {
            var go = new GameObject(name); go.transform.SetParent(parent,false); go.transform.localPosition = pos; go.transform.localScale = scale;
            go.AddComponent<MeshFilter>().sharedMesh = StoneMesh(); go.AddComponent<MeshRenderer>().sharedMaterial = m;
            if (solid) { go.AddComponent<BoxCollider>(); go.layer = 6; } return go;
        }
        static Mesh CrystalMesh() {
            if (crystalMesh) return crystalMesh;
            var v = new List<Vector3>(); var t = new List<int>();
            for (int i = 0; i < 6; i++) {
                float a = i * Mathf.PI / 3, b = (i+1) * Mathf.PI / 3;
                Vector3 p = new Vector3(Mathf.Cos(a)*.3f,0,Mathf.Sin(a)*.3f), q = new Vector3(Mathf.Cos(b)*.3f,0,Mathf.Sin(b)*.3f);
                Face(v,t,p,q,q+Vector3.up*.7f,p+Vector3.up*.7f);
                Face(v,t,p+Vector3.up*.7f,q+Vector3.up*.7f,new Vector3(.07f,1.15f,0));
            }
            crystalMesh = new Mesh { name = "Hexagonal frost crystal" }; crystalMesh.SetVertices(v); crystalMesh.SetTriangles(t,0); crystalMesh.RecalculateNormals(); return crystalMesh;
        }
        static void Crystal(Transform parent, Vector3 pos, float scale, Material m, float lean = 0) {
            var go = new GameObject("Frost crystal"); go.transform.SetParent(parent,false); go.transform.localPosition = pos;
            go.transform.localScale = Vector3.one * scale; go.transform.localRotation = Quaternion.Euler(lean, Random.Range(0,360),lean*.5f);
            go.AddComponent<MeshFilter>().sharedMesh = CrystalMesh(); go.AddComponent<MeshRenderer>().sharedMaterial = m;
        }
        static Light Light(string name, Transform parent, Vector3 pos, Color color, float intensity, float range, bool shadows = false) {
            var light = Group(name,parent,pos).gameObject.AddComponent<Light>(); light.type = LightType.Point;
            light.color = color; light.intensity = intensity; light.range = range;
            light.shadows = shadows ? LightShadows.Soft : LightShadows.None; light.shadowBias = .025f; light.shadowNormalBias = .12f; return light;
        }
        static void Lantern(Transform parent, Vector3 pos) {
            var root = Group("Amber lantern",parent,pos);
            var iron = Material(new Color(.12f,.1f,.12f)); var gold = Material(new Color(1f,.55f,.12f),true);
            Stone("Lantern roof",root,new Vector3(0,.48f,0),new Vector3(.65f,.12f,.55f),iron,false);
            Stone("Lantern foot",root,Vector3.zero,new Vector3(.5f,.1f,.45f),iron,false);
            Shape("Warm glass",PrimitiveType.Cube,root,new Vector3(0,.24f,0),new Vector3(.3f,.42f,.3f),gold);
            for(int x=-1;x<=1;x+=2) for(int z=-1;z<=1;z+=2)
                Shape("Iron frame",PrimitiveType.Cube,root,new Vector3(x*.2f,.24f,z*.18f),new Vector3(.045f,.5f,.045f),iron);
            // Broad unshadowed bounce from lanterns; the soft key and SSAO supply contact shadows.
            Light("Warm lantern pool",root,new Vector3(0,.4f,-.4f),new Color(1f,.62f,.27f),12f,6f);
        }
        public static void Build(SliceGame game) {
            var previousRandom = Random.state; Random.InitState(5577);
            var root = Group("Frostvault · environment",game.transform,Vector3.zero); game.dungeonRoot=root.gameObject;
            var snow = Material(new Color(.46f,.56f,.69f));
            var stone = Material(new Color(.23f,.28f,.35f));
            var dark = Material(new Color(.12f,.16f,.22f));
            var ice = Material(new Color(.12f,.62f,.76f),true);
            Stone("Foundation",root,new Vector3(0,-.4f,0),new Vector3(22,.8f,17),dark);
            for (int x = -7; x <= 7; x++) for (int z = -5; z <= 5; z++) {
                float c = Random.Range(.285f,.315f);
                var tile = Stone("Slate floor",root,new Vector3(x*1.4f,-.03f,z*1.4f),new Vector3(1.405f,.14f,1.405f),Material(new Color(c*.83f,c,c*1.22f)),false);
                tile.transform.Rotate(0,Random.Range(0,4)*90,0);
            }
            for (int x=-7;x<=7;x++) for (int row=0;row<3;row++) {
                if (Mathf.Abs(x)<=1) continue;
                Stone("Back wall",root,new Vector3(x*1.45f+(row%2)*.22f,.4f+row*.78f,8),new Vector3(1.46f,.78f,.8f),stone);
                if(row==2) SliceDressing.Snow(root,new Vector3(x*1.45f,2.42f,8),new Vector3(1.75f,.42f,1.1f),snow);
            }
            // Foreground stays low so the camera never hides the player.
            for (int x=-7;x<=7;x++) {
                Stone("Foreground wall",root,new Vector3(x*1.45f,.32f,-8),new Vector3(1.45f,.65f,.8f),stone);
                SliceDressing.Snow(root,new Vector3(x*1.45f,.66f,-8),new Vector3(1.75f,.32f,1.05f),snow);
            }
            for (int side=-1;side<=1;side+=2) for(int z=-5;z<=5;z++) for(int row=0;row<2;row++) {
                Stone("Side wall",root,new Vector3(side*10.6f,.42f+row*.8f,z*1.45f),new Vector3(.8f,.8f,1.45f),stone);
                if(row==1) SliceDressing.Snow(root,new Vector3(side*10.6f,1.65f,z*1.45f),new Vector3(1.15f,.4f,1.75f),snow);
            }
            foreach(var p in new[]{new Vector3(-5,0,1.4f),new Vector3(5,0,1.4f),new Vector3(-6,0,-4.7f),new Vector3(6,0,-4.7f)}) {
                var pillar = Group("Ruined cover pillar",root,p);
                Stone("Plinth",pillar,new Vector3(0,.2f,0),new Vector3(1.55f,.4f,1.55f),dark);
                for(int row=0;row<3;row++) Stone("Pillar masonry",pillar,new Vector3(0,.63f+row*.53f,0),new Vector3(1.15f,.52f,1.15f),stone);
                Stone("Capital",pillar,new Vector3(0,2.05f,0),new Vector3(1.55f,.3f,1.55f),stone);
                SliceDressing.Snow(pillar,new Vector3(.03f,2.21f,0),new Vector3(1.85f,.44f,1.8f),snow);
                Lantern(pillar,new Vector3(0,1.3f,-.82f));
            }
            foreach(var p in new[]{new Vector3(-9,0,6),new Vector3(9,0,6),new Vector3(-9,0,-6),new Vector3(9,0,-6)}) {
                for(int i=0;i<5;i++) Crystal(root,p+new Vector3(Random.Range(-.5f,.5f),0,Random.Range(-.5f,.5f)),Random.Range(.7f,1.9f),ice,Random.Range(-20,20));
                Light("Crystal blue spill",root,p+Vector3.up*.7f,Cyan,3,4.5f);
                SliceDressing.Snow(root,p+Vector3.up*.04f,new Vector3(3.1f,.55f,2.6f),snow);
            }
            for(int side=-1;side<=1;side+=2) {
                Lantern(root,new Vector3(side*5.7f,1.3f,7.3f));
                Stone("Portal jamb",root,new Vector3(side*1.65f,1.4f,8),new Vector3(.7f,2.8f,1),stone);
                Crystal(root,new Vector3(side*1.65f,2.7f,8),.6f,ice);
            }

            game.portal = Group("Extraction gateway",root,new Vector3(0,0,7.2f));

            Light("Portal spill",game.portal,new Vector3(0,1,0),Cyan,7,6);
            game.chest = Group("Room clear reward",root,new Vector3(0,0,4.6f)).gameObject;
            var chestPresentation=game.chest.AddComponent<SliceChest>();
            var wood=Material(new Color(.38f,.20f,.10f)); var brass=Material(new Color(.78f,.52f,.20f));
            Stone("Chest base",game.chest.transform,new Vector3(0,.28f,0),new Vector3(1.3f,.55f,.9f),wood,false);
            chestPresentation.lid=Group("Chest lid hinge",game.chest.transform,new Vector3(0,.55f,.43f));
            Stone("Chest lid",chestPresentation.lid,new Vector3(0,.11f,-.43f),new Vector3(1.34f,.23f,.94f),wood,false);
            for(int s=-1;s<=1;s+=2) {
                Stone("Chest band",game.chest.transform,new Vector3(s*.4f,.28f,0),new Vector3(.1f,.57f,.94f),brass,false);
                Stone("Lid band",chestPresentation.lid,new Vector3(s*.4f,.11f,-.43f),new Vector3(.1f,.25f,.97f),brass,false);
            }
            Stone("Chest clasp",chestPresentation.lid,new Vector3(0,.02f,-.91f),new Vector3(.18f,.2f,.08f),brass,false);
            chestPresentation.rewardLight=Light("Chest reward glow",game.chest.transform,new Vector3(0,.9f,0),new Color(1,.72f,.32f),2.5f,4);
            game.chest.SetActive(false);
            BuildPlayer(game);
            BuildEnemy(game,new Vector3(-2,0,1),SliceEnemy.Kind.Gremlin);
            BuildEnemy(game,new Vector3(3,0,2.5f),SliceEnemy.Kind.Gremlin);
            BuildEnemy(game,new Vector3(0,0,5.3f),SliceEnemy.Kind.Charger);
            var cam = Group("Gameplay camera",game.transform,new Vector3(0,16,-16)).gameObject.AddComponent<Camera>();
            cam.tag="MainCamera"; cam.transform.LookAt(new Vector3(0,0,.7f)); cam.orthographic=true; cam.orthographicSize=10.7f;
            cam.nearClipPlane=.1f; cam.farClipPlane=80; cam.backgroundColor=new Color(.035f,.055f,.09f); cam.clearFlags=CameraClearFlags.SolidColor;
            cam.allowHDR=true; cam.gameObject.AddComponent<AudioListener>(); cam.GetUniversalAdditionalCameraData().renderPostProcessing=true;
            game.viewCamera=cam;
            var sun=Group("Cold ambient key",root,Vector3.zero).gameObject.AddComponent<Light>(); sun.type=LightType.Directional;
            sun.transform.rotation=Quaternion.Euler(48,-35,0); sun.color=new Color(.86f,.9f,1f); sun.intensity=1.25f; sun.shadows=LightShadows.Soft; sun.shadowStrength=.75f;
            var fill=Group("Soft lavender sky fill",root,Vector3.zero).gameObject.AddComponent<Light>(); fill.type=LightType.Directional;
            fill.transform.rotation=Quaternion.Euler(55,170,0); fill.color=new Color(.9f,.85f,1f); fill.intensity=.75f; fill.shadows=LightShadows.None;
            RenderSettings.skybox=null; RenderSettings.ambientMode=AmbientMode.Trilight;
            RenderSettings.ambientSkyColor=new Color(.4f,.44f,.52f); RenderSettings.ambientEquatorColor=new Color(.28f,.31f,.4f); RenderSettings.ambientGroundColor=new Color(.16f,.19f,.25f);
            RenderSettings.fog=true; RenderSettings.fogColor=new Color(.17f,.21f,.29f); RenderSettings.fogMode=FogMode.ExponentialSquared; RenderSettings.fogDensity=.007f;
            var profile = ScriptableObject.CreateInstance<VolumeProfile>(); profile.name="Frostvault atmosphere";
            profile.Add<Bloom>().intensity.Override(.22f);
            var bloom=profile.TryGet<Bloom>(out var b) ? b : null; if(bloom) { bloom.threshold.Override(1.1f); bloom.scatter.Override(.65f); }
            profile.Add<Tonemapping>().mode.Override(TonemappingMode.ACES);
            profile.Add<Vignette>().intensity.Override(.10f);
            var colors=profile.Add<ColorAdjustments>(); colors.postExposure.Override(.7f); colors.contrast.Override(5); colors.saturation.Override(-3);
            var volume=Group("Atmosphere",root,Vector3.zero).gameObject.AddComponent<Volume>(); volume.isGlobal=true; volume.sharedProfile=profile;
            SliceDressing.Build(root,game,snow,stone,dark);
            game.overworld=SliceOverworld.Build(game);
            Random.state=previousRandom;
        }
        static CharacterController Motor(GameObject go,float radius,float height) {
            var c=go.AddComponent<CharacterController>(); c.radius=radius; c.height=height; c.center=Vector3.up*height*.5f;
            c.stepOffset=.1f; c.skinWidth=.025f; c.minMoveDistance=0; return c;
        }
        static Transform Model(GameObject prefab,Transform parent) {
            if(!prefab) return null;
            var model=Object.Instantiate(prefab,parent).transform; model.localPosition=Vector3.zero; model.localRotation=Quaternion.identity; return model;
        }
        static void BuildPlayer(SliceGame game) {
            var root=Group("Drifter",game.transform,new Vector3(0,0,-4)); Motor(root.gameObject,.34f,1.2f);
            var player=root.gameObject.AddComponent<SlicePlayer>(); game.player=player; player.game=game;
            var v=Group("Visual · replace with Tripo prefab",root,Vector3.zero); player.visual=v;
            if(!Model(game.tuning.drifterModel,v)) {
                var green=Material(new Color(.035f,.18f,.12f)); var cream=Material(new Color(.92f,.87f,.67f)); var orange=Material(new Color(1f,.44f,.04f));
                Shape("Penguin body",PrimitiveType.Sphere,v,new Vector3(0,.62f,0),new Vector3(.95f,1.24f,.82f),green);
                Shape("Cream belly",PrimitiveType.Sphere,v,new Vector3(0,.54f,.28f),new Vector3(.7f,.8f,.35f),cream);
                Shape("Penguin head",PrimitiveType.Sphere,v,new Vector3(0,1.13f,.06f),new Vector3(.82f,.82f,.75f),green);
                for(int s=-1;s<=1;s+=2) {
                    Shape("Face patch",PrimitiveType.Sphere,v,new Vector3(s*.19f,1.14f,.35f),new Vector3(.35f,.46f,.13f),cream);
                    Shape("Eye",PrimitiveType.Sphere,v,new Vector3(s*.18f,1.2f,.42f),new Vector3(.095f,.14f,.065f),Material(new Color(.015f,.02f,.025f)));
                    Shape("Eye glint",PrimitiveType.Sphere,v,new Vector3(s*.18f-.014f,1.23f,.448f),Vector3.one*.028f,Material(Color.white));
                    var flipper=Shape("Flipper",PrimitiveType.Sphere,v,new Vector3(s*.47f,.65f,0),new Vector3(.22f,.65f,.25f),green); flipper.transform.localRotation=Quaternion.Euler(0,0,s*22);
                    Shape("Orange foot",PrimitiveType.Sphere,v,new Vector3(s*.23f,.095f,.17f),new Vector3(.32f,.17f,.45f),orange);
                }
                var beak=Shape("Beak",PrimitiveType.Sphere,v,new Vector3(0,1.05f,.46f),new Vector3(.28f,.17f,.29f),orange);
                var red=Material(new Color(.48f,.035f,.06f));
                Shape("Red scarf neck",PrimitiveType.Cylinder,v,new Vector3(0,.91f,.02f),new Vector3(.86f,.095f,.76f),red);
                var tail=Stone("Scarf tail",v,new Vector3(-.35f,.82f,-.55f),new Vector3(.23f,.1f,.9f),red,false); tail.transform.localRotation=Quaternion.Euler(-12,-28,0);
                Stone("Leather pouch",v,new Vector3(-.32f,.48f,.34f),new Vector3(.27f,.3f,.17f),Material(new Color(.24f,.12f,.055f)),false);
            }
            player.weaponPivot=Group("Sword swing pivot",root,new Vector3(0,.7f,0));
            var weapon=Group("Sword model slot",player.weaponPivot,new Vector3(.6f,0,.22f));
            if(!Model(game.tuning.swordModel,weapon)) {
                Crystal(weapon,new Vector3(0,0,0),.85f,Material(Cyan,true),90);
                Stone("Sword guard",weapon,new Vector3(0,.03f,-.08f),new Vector3(.5f,.12f,.12f),Material(new Color(.55f,.65f,.72f)),false);
                Shape("Grip",PrimitiveType.Cylinder,weapon,new Vector3(0,0,-.23f),new Vector3(.1f,.17f,.1f),Material(new Color(.19f,.12f,.1f))).transform.localRotation=Quaternion.Euler(90,0,0);
            }
        }
        public static void BuildEnemy(SliceGame game,Vector3 pos,SliceEnemy.Kind kind) {
            bool big=kind==SliceEnemy.Kind.Charger; var root=Group(big?"Frost charger":"Frost gremlin",game.transform,pos);
            Motor(root.gameObject,big?.55f:.35f,big?1.6f:1f);
            var enemy=root.gameObject.AddComponent<SliceEnemy>(); enemy.kind=kind; enemy.game=game; game.enemies.Add(enemy);
            var visual=Group("Visual · replace with Tripo prefab",root,Vector3.zero); enemy.visual=visual;
            var prefab=big?game.tuning.chargerModel:game.tuning.gremlinModel;
            if(Model(prefab,visual)) return;
            var blue=Material(big?new Color(.2f,.3f,.4f):new Color(.32f,.44f,.53f)); var pale=Material(new Color(.57f,.74f,.82f)); var dark=Material(new Color(.03f,.065f,.11f));
            float size=big?1.45f:1;
            var body=Group("Creature shapes",visual,Vector3.zero); body.localScale=Vector3.one*size;
            Shape("Body",PrimitiveType.Sphere,body,new Vector3(0,.48f,0),new Vector3(.9f,.85f,1.1f),blue);
            Shape("Snout",PrimitiveType.Sphere,body,new Vector3(0,.4f,.48f),new Vector3(.65f,.4f,.45f),dark);
            for(int s=-1;s<=1;s+=2) {
                Shape("Eye",PrimitiveType.Sphere,body,new Vector3(s*.25f,.63f,.43f),new Vector3(.15f,.12f,.11f),Material(Cyan,true));
                for(int z=-1;z<=1;z+=2) Shape("Foot",PrimitiveType.Sphere,body,new Vector3(s*.37f,.13f,z*.3f),new Vector3(.3f,.25f,.35f),pale);
                Crystal(body,new Vector3(s*.3f,.65f,.15f),big?.9f:.5f,pale,s*35);
            }
            for(int i=0;i<5;i++) Crystal(body,new Vector3(Random.Range(-.3f,.3f),.68f,Random.Range(-.35f,.15f)),Random.Range(.45f,.8f),pale,Random.Range(-25,25));
        }
    }
}
