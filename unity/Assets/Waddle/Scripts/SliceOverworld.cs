using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object=UnityEngine.Object;

namespace Waddle {
    // Authored outdoor region. World construction is deterministic; animation uses SliceGame.Tick.
    public sealed class SliceOverworld : MonoBehaviour {
        public static readonly Vector3 Origin=new Vector3(70,0,0);
        public static readonly Vector3 Camp=new Vector3(-5,0,-10);
        public Transform entrance, cache, fire, forge;
        public Transform[] villagers;
        public string[] villagerNames={"PIP · SCOUT", "MARA · KEEPER", "BRAM · SMITH"};
        public MeshFilter snowfall;
        public Light fireLight;
        public Renderer cacheGlow;
        public Transform[] flames;
        public float Clock { get; private set; }
        readonly Dictionary<SliceEnemy,Vector3> homes=new Dictionary<SliceEnemy,Vector3>();
        Mesh snowMesh;
        Vector3[] snowVertices;
        SliceSkeleton[] npcRigs;
        static Material snow, rock, wood, cloth, ice, iron;
        static Mesh cone;
        static GameObject Shape(string name,PrimitiveType type,Transform parent,Vector3 p,Vector3 size,Material m,bool solid=false) => SliceWorld.Shape(name,type,parent,p,size,m,solid);
        static Transform Group(string name,Transform parent,Vector3 p) => SliceWorld.Group(name,parent,p);
        static Light Glow(Transform parent,Vector3 p,Color color,float power,float range) {
            var light=Group("Outdoor practical light",parent,p).gameObject.AddComponent<Light>();
            light.type=LightType.Point; light.color=color; light.intensity=power; light.range=range; return light;
        }
        public bool IsSafe(Vector3 p) => Vector3.Distance(p,Origin+Camp)<7.5f;
        public bool CanChase(SliceEnemy e) {
            if(!homes.ContainsKey(e)) homes[e]=e.transform.position;
            if(IsSafe(SliceGame.Active.player.transform.position) || IsSafe(e.transform.position)) {
                // Enemies never enter the camp. Restore their wilderness post if led to its boundary.
                if(Vector3.Distance(e.transform.position,homes[e])>.1f) {
                    var motor=e.GetComponent<CharacterController>(); motor.enabled=false; e.transform.position=homes[e]; motor.enabled=true;
                }
                return false;
            }
            return Vector3.Distance(e.transform.position,SliceGame.Active.player.transform.position)<8 && Vector3.Distance(e.transform.position,homes[e])<10;
        }
        public string Prompt(SliceGame game) {
            Vector3 p=game.player.transform.position;
            if(Vector3.Distance(p,entrance.position)<2.5f) return "[E]  ENTER FROSTVAULT";
            if(Vector3.Distance(p,cache.position)<2) return game.CacheClaimed?"SUPPLY CACHE · ALREADY CLAIMED":"[E]  SEARCH THE SUPPLY CACHE";
            if(Vector3.Distance(p,forge.position)<2) return "[E]  INSPECT THE FROSTFORGE";
            for(int i=0;i<villagers.Length;i++) if(Vector3.Distance(p,villagers[i].position)<2) return "[E]  TALK TO "+villagerNames[i].Split(' ')[0];
            return null;
        }
        public void Interact(SliceGame game) {
            Vector3 p=game.player.transform.position;
            if(Vector3.Distance(p,entrance.position)<2.5f) { game.EnterFrostvault(); return; }
            if(Vector3.Distance(p,cache.position)<2) { if(!game.CacheClaimed) game.ClaimCache(); else game.Say("Empty now. The supplies you found here are safe in your bank."); return; }
            if(Vector3.Distance(p,forge.position)<2) { game.Say("FROSTFORGE · Bram is getting the forge ready. Equipment crafting is coming in a later pass."); return; }
            string[] lines={"PIP · Follow the lanterns northeast to Frostvault. I spotted a supply cache beyond the frozen pond, northwest of camp.","MARA · Rest by our fire to recover. If the vault takes you, we'll bring you home. Anything you bank is always safe.","BRAM · Those frost creatures keep their distance from our fire. Out there, keep moving—and watch for the charger's warning."};
            for(int i=0;i<villagers.Length;i++) if(Vector3.Distance(p,villagers[i].position)<2) { game.Say(lines[i]); return; }
        }
        public static SliceOverworld Build(SliceGame game) {
            var previous=Random.state; Random.InitState(98221);
            var root=Group("Snowhaven · overworld",game.transform,Origin);
            var world=root.gameObject.AddComponent<SliceOverworld>();
            snow=SliceWorld.Material(new Color(.70f,.79f,.86f)); rock=SliceWorld.Material(new Color(.25f,.34f,.44f));
            wood=SliceWorld.Material(new Color(.22f,.12f,.075f)); cloth=SliceWorld.Material(new Color(.40f,.13f,.15f));
            ice=SliceWorld.Material(new Color(.21f,.49f,.62f)); ice.SetFloat("_Smoothness",.7f);
            iron=SliceWorld.Material(new Color(.10f,.14f,.20f));
            Shape("Snowfield foundation",PrimitiveType.Cube,root,new Vector3(0,-.35f,0),new Vector3(54,.7f,54),snow,true);
            // Low sculpted banks soften the edge; an invisible solid rim prevents falling out of the authored region.
            for(int side=-1;side<=1;side+=2) {
                Shape("Region boundary",PrimitiveType.Cube,root,new Vector3(side*26,1,0),new Vector3(.6f,4,54),rock,true).GetComponent<Renderer>().enabled=false;
                Shape("Region boundary",PrimitiveType.Cube,root,new Vector3(0,1,side*26),new Vector3(54,4,.6f),rock,true).GetComponent<Renderer>().enabled=false;
                for(int n=-24;n<=24;n+=4) { Boulder(root,new Vector3(side*25,0,n),Random.Range(2,4)); Boulder(root,new Vector3(n,0,side*25),Random.Range(2,4)); }
            }
            // An ochre packed-snow trail winds through pale drifts to the vault.
            var path=SliceWorld.Material(new Color(.54f,.62f,.67f));
            Vector3[] points={new Vector3(-5,0,-12),new Vector3(-1,0,-6),new Vector3(5,0,-2),new Vector3(7,0,6),new Vector3(11,0,15)};
            for(int k=0;k<points.Length-1;k++) {
                float length=Vector3.Distance(points[k],points[k+1]);
                for(float t=0;t<length;t+=1.1f) {
                    var p=Vector3.Lerp(points[k],points[k+1],t/length); p.x+=Mathf.Sin(t*1.5f+k)*.12f;
                    Shape("Packed snow trail",PrimitiveType.Sphere,root,p+Vector3.down*.045f,new Vector3(3.2f,.13f,2.8f),path);
                    if(((int)(t*10))%3==0) for(int side=-1;side<=1;side+=2) Shape("Old trail stone",PrimitiveType.Sphere,root,p+new Vector3(side*1.6f,.05f,0),new Vector3(.28f,.19f,.35f),rock);
                }
            }
            var clearing=Shape("Camp clearing",PrimitiveType.Cylinder,root,Camp+new Vector3(0,.015f,0),new Vector3(13,.025f,12),path);
            world.fire=Group("Snowhaven hearth",root,Camp);
            for(int i=0;i<12;i++) {
                float a=i*Mathf.PI/6;
                Shape("Hearth stones",PrimitiveType.Sphere,world.fire,new Vector3(Mathf.Cos(a)*.92f,.19f,Mathf.Sin(a)*.92f),new Vector3(.5f,.35f,.4f),rock,true);
            }
            for(int i=0;i<3;i++) {
                var log=Shape("Charred hearth log",PrimitiveType.Cylinder,world.fire,new Vector3(0,.22f,0),new Vector3(.22f,.72f,.22f),wood);
                log.transform.localRotation=Quaternion.Euler(90,i*60,0);
            }
            world.flames=new Transform[5];
            for(int i=0;i<5;i++) world.flames[i]=Shape("Amber flame",PrimitiveType.Sphere,world.fire,new Vector3((i-2)*.17f,.55f,Mathf.Sin(i)*.18f),new Vector3(.28f,.9f,.3f),SliceWorld.Material(new Color(1,.34f+i*.06f,.035f),true)).transform;
            world.fireLight=Glow(world.fire,Vector3.up*1.4f,new Color(1,.47f,.15f),22,10);
            Tent(root,Camp+new Vector3(-4.4f,0,2.4f),-20,cloth);
            Tent(root,Camp+new Vector3(3.7f,0,3.5f),20,SliceWorld.Material(new Color(.12f,.28f,.31f)));
            Tent(root,Camp+new Vector3(-3.9f,0,-4.1f),140,SliceWorld.Material(new Color(.39f,.28f,.17f)));
            world.forge=Group("Bram's frostforge",root,Camp+new Vector3(4.6f,0,-2.1f));
            Shape("Forge stone base",PrimitiveType.Cube,world.forge,new Vector3(0,.4f,0),new Vector3(1.6f,.8f,1.4f),rock,true);
            Shape("Forge hot coals",PrimitiveType.Sphere,world.forge,new Vector3(0,.84f,0),new Vector3(1.2f,.2f,.9f),SliceWorld.Material(new Color(1,.28f,.035f),true));
            Glow(world.forge,Vector3.up*1.2f,new Color(1,.39f,.12f),9,5);
            Shape("Anvil pedestal",PrimitiveType.Cube,world.forge,new Vector3(-1.1f,.35f,-.4f),new Vector3(.65f,.7f,.65f),wood,true);
            Shape("Anvil",PrimitiveType.Cube,world.forge,new Vector3(-1.1f,.8f,-.4f),new Vector3(1,.23f,.5f),iron);
            Shape("Forge chimney",PrimitiveType.Cube,world.forge,new Vector3(0,1.8f,.65f),new Vector3(.7f,2.4f,.55f),rock,true);
            for(int i=0;i<7;i++) Crate(root,Camp+new Vector3(-5.5f+(i%3)*.7f,0,5+(i/3)*.6f),.6f);
            for(int s=-1;s<=1;s+=2) {
                var bench=Group("Camp log bench",root,Camp+new Vector3(s*2.4f,0,-.6f));
                Shape("Bench seat",PrimitiveType.Cube,bench,new Vector3(0,.45f,0),new Vector3(.6f,.25f,2),wood,true);
                for(int z=-1;z<=1;z+=2) Shape("Bench leg",PrimitiveType.Cube,bench,new Vector3(0,.2f,z*.65f),new Vector3(.38f,.4f,.3f),wood);
            }
            world.villagers=new Transform[3];
            Vector3[] npcPositions={Camp+new Vector3(1.6f,0,3.2f),Camp+new Vector3(-2.4f,0,2),Camp+new Vector3(3.3f,0,-3.7f)};
            for(int i=0;i<3;i++) {
                world.villagers[i]=Group(world.villagerNames[i],root,npcPositions[i]);
                world.villagers[i].localRotation=Quaternion.Euler(0,180+i*35,0);
                if(game.tuning.drifterModel) { var npc=Object.Instantiate(game.tuning.drifterModel,world.villagers[i]); npc.name="Camp penguin"; }
                else {
                    Shape("Penguin body",PrimitiveType.Sphere,world.villagers[i],new Vector3(0,.65f,0),new Vector3(.8f,1.2f,.8f),iron);
                    Shape("Penguin belly",PrimitiveType.Sphere,world.villagers[i],new Vector3(0,.6f,.28f),new Vector3(.6f,.8f,.3f),snow);
                    Shape("Penguin beak",PrimitiveType.Sphere,world.villagers[i],new Vector3(0,1,.4f),new Vector3(.3f,.18f,.3f),SliceWorld.Material(new Color(1,.5f,.08f)));
                }
                var c=world.villagers[i].gameObject.AddComponent<CapsuleCollider>(); c.radius=.4f; c.height=1.3f; c.center=Vector3.up*.65f; world.villagers[i].gameObject.layer=6;
                // Colored wool collars distinguish reused character models until bespoke NPCs arrive.
                Shape("Villager wool collar",PrimitiveType.Cylinder,world.villagers[i],new Vector3(0,.92f,0),new Vector3(.75f,.055f,.64f),SliceWorld.Material(i==0?new Color(.83f,.53f,.16f):i==1?new Color(.32f,.46f,.65f):new Color(.31f,.46f,.25f)));
            }
            // Frozen pond is a shallow, solid, traversable surface at the same gameplay height.
            Shape("Frozen mirror pond",PrimitiveType.Sphere,root,new Vector3(-13,.025f,0),new Vector3(11,.12f,8),ice);
            for(int i=0;i<16;i++) {
                float a=i*Mathf.PI/8;
                SliceDressing.Snow(root,new Vector3(-13+Mathf.Cos(a)*5.3f,.04f,Mathf.Sin(a)*3.8f),new Vector3(2.2f,.3f,1.4f),snow);
            }
            var crackMat=SliceWorld.Material(new Color(.49f,.75f,.82f),true);
            for(int i=0;i<7;i++) {
                var crack=Shape("Pond fracture",PrimitiveType.Cube,root,new Vector3(-13+Mathf.Sin(i*2)*3,.09f,Mathf.Cos(i)*2),new Vector3(.035f,.015f,1.9f),crackMat); crack.transform.localRotation=Quaternion.Euler(0,i*47,0);
            }
            world.cache=Group("Lost expedition cache",root,new Vector3(-13,0,10));
            Crate(world.cache,Vector3.zero,1.2f);
            world.cacheGlow=Shape("Cache frost seal",PrimitiveType.Cube,world.cache,new Vector3(0,.65f,-.61f),new Vector3(.27f,.27f,.04f),SliceWorld.Material(new Color(.08f,.8f,.9f),true)).GetComponent<Renderer>();
            Glow(world.cache,Vector3.up*1.2f,SliceWorld.Cyan,4,4);
            // Ruined stone gateway rises out of a snowy escarpment.
            world.entrance=Group("Frostvault entrance",root,new Vector3(11,0,16));
            for(int s=-1;s<=1;s+=2) {
                Boulder(world.entrance,new Vector3(s*3.3f,0,1.7f),3.7f);
                Shape("Ancient entrance pier",PrimitiveType.Cube,world.entrance,new Vector3(s*1.7f,1.65f,.8f),new Vector3(.85f,3.3f,1.3f),rock,true);
                SliceDressing.Snow(world.entrance,new Vector3(s*1.7f,3.31f,.8f),new Vector3(1.2f,.35f,1.6f),snow);
                Shape("Vault cyan seal",PrimitiveType.Cube,world.entrance,new Vector3(s*1.7f,2,-.01f),new Vector3(.16f,.6f,.06f),crackMat);
            }
            Shape("Entrance lintel",PrimitiveType.Cube,world.entrance,new Vector3(0,3.35f,.8f),new Vector3(4.3f,.7f,1.5f),rock,true);
            SliceDressing.Snow(world.entrance,new Vector3(0,3.72f,.8f),new Vector3(4.8f,.5f,1.9f),snow);
            Shape("Vault shadow",PrimitiveType.Cube,world.entrance,new Vector3(0,1.5f,1.2f),new Vector3(2.6f,3,.15f),iron);
            for(int i=-2;i<=2;i++) Shape("Gateway frozen bars",PrimitiveType.Cube,world.entrance,new Vector3(i*.48f,1.45f,1.05f),new Vector3(.08f,2.8f,.12f),crackMat);
            Glow(world.entrance,new Vector3(0,1,-1),SliceWorld.Cyan,10,7);
            for(int i=0;i<9;i++) {
                Vector3 p=Vector3.Lerp(new Vector3(-.5f,0,-5),new Vector3(11,0,14),i/8f); p.x+=(i%2==0?-2.3f:2.3f);
                Lantern(root,p);
            }
            Sign(root,Camp+new Vector3(4,0,2),"FROSTVAULT  ↗");
            Sign(root,new Vector3(2,0,4),"CAMP  ↙     VAULT  ↗");
            // Tree clusters leave both the main trail and the pond/cache route readable.
            for(int i=0;i<95;i++) {
                var p=new Vector3(Random.Range(-24,24),0,Random.Range(-24,24));
                if(Vector3.Distance(p,Camp)<9 || Vector3.Distance(p,new Vector3(-13,0,0))<7 || Vector3.Distance(p,new Vector3(-13,0,10))<3 || Vector3.Distance(p,new Vector3(11,0,16))<5) continue;
                bool nearPath=false; foreach(var point in points) if(Vector3.Distance(p,point)<4) nearPath=true;
                if(nearPath || (p.x>3 && p.x<10 && p.z>-5 && p.z<13)) continue;
                Pine(root,p,Random.Range(.8f,1.45f));
            }
            foreach(var p in new[]{new Vector3(-17,0,13),new Vector3(17,0,5),new Vector3(4,0,18),new Vector3(-4,0,8)}) {
                Boulder(root,p,1.6f); for(int i=0;i<3;i++) {
                    var c=Shape("Wild frost crystal",PrimitiveType.Cube,root,p+new Vector3(i*.35f,.7f,-.8f),new Vector3(.25f,1.3f-i*.2f,.27f),crackMat); c.transform.localRotation=Quaternion.Euler(0,20,i*13-15);
                }
                Glow(root,p+Vector3.up,SliceWorld.Cyan,3,4);
            }
            int dungeonCount=game.enemies.Count;
            foreach(var p in new[]{new Vector3(-10,0,7),new Vector3(14,0,4),new Vector3(3,0,13)}) {
                SliceWorld.BuildEnemy(game,Origin+p,SliceEnemy.Kind.Gremlin);
                var e=game.enemies[game.enemies.Count-1]; e.transform.SetParent(root,true); game.wildernessEnemies.Add(e);
            }
            game.enemies.RemoveRange(dungeonCount,game.enemies.Count-dungeonCount);
            var key=Group("Snowhaven soft sun",root,Vector3.zero).gameObject.AddComponent<Light>(); key.type=LightType.Directional;
            key.transform.rotation=Quaternion.Euler(40,-35,0); key.color=new Color(.86f,.91f,1); key.intensity=1.5f; key.shadows=LightShadows.Soft; key.shadowStrength=.65f;
            var fill=Group("Lavender outdoor bounce",root,Vector3.zero).gameObject.AddComponent<Light>(); fill.type=LightType.Directional;
            fill.transform.rotation=Quaternion.Euler(65,150,0); fill.color=new Color(.78f,.74f,1); fill.intensity=.55f;
            var profile=ScriptableObject.CreateInstance<VolumeProfile>(); profile.name="Snowhaven atmosphere";
            profile.Add<Bloom>().intensity.Override(.28f); profile.Add<Tonemapping>().mode.Override(TonemappingMode.ACES);
            profile.Add<ColorAdjustments>().postExposure.Override(.35f); profile.Add<Vignette>().intensity.Override(.10f);
            var volume=root.gameObject.AddComponent<Volume>(); volume.isGlobal=true; volume.sharedProfile=profile;
            world.BuildSnow(game.viewCamera);
            Random.state=previous; return world;
        }
        static void Tent(Transform parent,Vector3 position,float yaw,Material canvas) {
            var root=Group("Expedition canvas tent",parent,position); root.localRotation=Quaternion.Euler(0,yaw,0);
            var mesh=new Mesh{name="Snowhaven tent canvas"};
            mesh.vertices=new[]{new Vector3(-1.6f,0,-1.5f),new Vector3(0,2.2f,-1.5f),new Vector3(-1.6f,0,1.5f),new Vector3(0,2.2f,1.5f),new Vector3(1.6f,0,-1.5f),new Vector3(1.6f,0,1.5f)};
            mesh.triangles=new[]{0,1,2,1,3,2,1,4,3,4,5,3,2,3,5}; mesh.RecalculateNormals();
            canvas.SetInt("_Cull",0); SliceDressing.MeshObject("Heavy tent canvas",root,Vector3.zero,Vector3.one,mesh,canvas);
            Shape("Tent footprint",PrimitiveType.Cube,root,new Vector3(0,.5f,.2f),new Vector3(2.5f,1,2.2f),wood,true).GetComponent<Renderer>().enabled=false;
            for(int side=-1;side<=1;side+=2) {
                var beam=Shape("Tent front pole",PrimitiveType.Cylinder,root,new Vector3(side*.8f,1.1f,-1.5f),new Vector3(.09f,1.38f,.09f),wood); beam.transform.localRotation=Quaternion.Euler(0,0,side*36);
                SliceDressing.Snow(root,new Vector3(side*.8f,1.35f,.2f),new Vector3(1.8f,.3f,3.3f),snow).transform.localRotation=Quaternion.Euler(0,0,side*-34);
            }
            Shape("Tent ridge",PrimitiveType.Cylinder,root,new Vector3(0,2.22f,0),new Vector3(.08f,1.8f,.08f),wood).transform.localRotation=Quaternion.Euler(90,0,0);
            Lantern(root,new Vector3(-1.9f,0,-1.7f));
        }
        static void Crate(Transform parent,Vector3 p,float size) {
            var root=Group("Expedition supplies",parent,p);
            Shape("Wooden supply box",PrimitiveType.Cube,root,new Vector3(0,size*.5f,0),Vector3.one*size,wood,true);
            for(int side=-1;side<=1;side+=2) Shape("Crate iron band",PrimitiveType.Cube,root,new Vector3(side*size*.33f,size*.5f,0),new Vector3(.07f,size+.025f,size+.03f),iron);
            SliceDressing.Snow(root,new Vector3(0,size,0),new Vector3(size*1.12f,.16f,size*1.08f),snow);
        }
        static void Lantern(Transform parent,Vector3 p) {
            var root=Group("Trail lantern",parent,p);
            Shape("Lantern timber post",PrimitiveType.Cube,root,new Vector3(0,.9f,0),new Vector3(.14f,1.8f,.14f),wood,true);
            Shape("Lantern amber glass",PrimitiveType.Cube,root,new Vector3(0,1.65f,-.2f),new Vector3(.33f,.45f,.3f),SliceWorld.Material(new Color(1,.58f,.17f),true));
            Shape("Lantern dark cap",PrimitiveType.Cube,root,new Vector3(0,1.92f,-.2f),new Vector3(.48f,.1f,.45f),iron);
            Glow(root,new Vector3(0,1.5f,-.4f),new Color(1,.6f,.26f),8,5);
        }
        static void Sign(Transform parent,Vector3 p,string message) {
            var root=Group("Trail sign",parent,p);
            Shape("Sign post",PrimitiveType.Cube,root,new Vector3(0,.65f,0),new Vector3(.15f,1.3f,.15f),wood,true);
            Shape("Carved sign board",PrimitiveType.Cube,root,new Vector3(0,1.25f,0),new Vector3(2.6f,.5f,.16f),wood);
            var text=Group("Wayfinding lettering",root,new Vector3(0,1.25f,-.095f)).gameObject.AddComponent<TextMesh>();
            text.text=message; text.anchor=TextAnchor.MiddleCenter; text.alignment=TextAlignment.Center; text.fontSize=42; text.characterSize=.055f; text.color=new Color(.95f,.85f,.62f); text.transform.localRotation=Quaternion.identity;
        }
        static void Boulder(Transform parent,Vector3 p,float size) {
            var go=Shape("Glacial boulder",PrimitiveType.Sphere,parent,p+Vector3.up*size*.28f,new Vector3(size,size*.7f,size*.85f),rock,true);
            go.transform.localRotation=Quaternion.Euler(0,Random.Range(0,180),Random.Range(-12,12));
            SliceDressing.Snow(parent,p+Vector3.up*size*.58f,new Vector3(size*1.08f,size*.32f,size),snow);
        }
        static void Pine(Transform parent,Vector3 p,float size) {
            var root=Group("Snow-laden fir",parent,p); root.localScale=Vector3.one*size;
            Shape("Fir trunk",PrimitiveType.Cylinder,root,new Vector3(0,1,0),new Vector3(.32f,1,.32f),wood,true);
            if(!cone) {
                cone=new Mesh{name="Faceted fir bough"}; var v=new List<Vector3>(); var t=new List<int>();
                for(int i=0;i<10;i++) { float a=i*Mathf.PI/5,b=(i+1)*Mathf.PI/5; int n=v.Count;
                    v.Add(new Vector3(Mathf.Cos(a),0,Mathf.Sin(a))); v.Add(Vector3.up*1.7f); v.Add(new Vector3(Mathf.Cos(b),0,Mathf.Sin(b))); t.AddRange(new[]{n,n+1,n+2}); }
                cone.SetVertices(v); cone.SetTriangles(t,0); cone.RecalculateNormals();
            }
            var green=SliceWorld.Material(new Color(.13f,.25f,.26f));
            for(int i=0;i<3;i++) {
                float width=1.65f-i*.4f;
                SliceDressing.MeshObject("Fir evergreen tier",root,new Vector3(0,.7f+i*.85f,0),new Vector3(width,.9f,width),cone,green);
                SliceDressing.MeshObject("Fir snow mantle",root,new Vector3(0,1+i*.85f,0),new Vector3(width*.9f,.8f,width*.9f),cone,snow);
            }
        }
        void BuildSnow(Camera camera) {
            var mesh=new Mesh{name="Snowhaven snowfall batch"}; var v=new Vector3[192*4]; var uv=new Vector2[v.Length]; var colors=new Color[v.Length]; var t=new int[192*6];
            for(int i=0;i<192;i++) { int n=i*4,k=i*6; uv[n]=Vector2.zero; uv[n+1]=Vector2.right; uv[n+2]=Vector2.one; uv[n+3]=Vector2.up;
                for(int j=0;j<4;j++) colors[n+j]=new Color(1,1,1,.5f); t[k]=n; t[k+1]=n+1; t[k+2]=n+2; t[k+3]=n; t[k+4]=n+2; t[k+5]=n+3; }
            mesh.vertices=v; mesh.uv=uv; mesh.colors=colors; mesh.triangles=t;
            snowfall=SliceDressing.MeshObject("Outdoor drifting snow",transform,Vector3.zero,Vector3.one,mesh,SliceDressing.SoftMaterial("Snowhaven soft frost",new Color(.85f,.94f,1,.6f))).GetComponent<MeshFilter>();
            snowfall.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
        }
        public void Tick(float dt) {
            if(!snowMesh) { snowMesh=Instantiate(snowfall.sharedMesh); snowfall.sharedMesh=snowMesh; snowVertices=new Vector3[192*4];
                var list=new List<SliceSkeleton>(); foreach(var npc in villagers) { var rig=npc.GetComponentInChildren<SliceSkeleton>(); if(rig) { rig.Initialize(); list.Add(rig); } } npcRigs=list.ToArray(); }
            Clock+=dt; var camera=SliceGame.Active.viewCamera;
            for(int i=0;i<192;i++) {
                var center=new Vector3(Mathf.Repeat(i*13.713f+Clock*.24f,50)-25,Mathf.Repeat(i*.719f-Clock*.35f,5)+.2f,Mathf.Repeat(i*9.417f,50)-25);
                center.x+=Mathf.Sin(Clock+i)*.2f; Vector3 x=camera.transform.right*.025f,y=camera.transform.up*.025f;
                int n=i*4; snowVertices[n]=center-x-y; snowVertices[n+1]=center+x-y; snowVertices[n+2]=center+x+y; snowVertices[n+3]=center-x+y;
            }
            snowMesh.vertices=snowVertices; snowMesh.RecalculateBounds();
            fireLight.intensity=22+Mathf.Sin(Clock*5.3f)*1.1f+Mathf.Sin(Clock*11)*.6f;
            for(int i=0;i<flames.Length;i++) flames[i].localScale=new Vector3(.28f,.72f+Mathf.Sin(Clock*7+i)*.18f,.3f);
            cacheGlow.enabled=!SliceGame.Active.CacheClaimed; cache.GetComponentInChildren<Light>().enabled=!SliceGame.Active.CacheClaimed;
            foreach(var rig in npcRigs) rig.Pose(dt,0,-1,-1,0);
        }
        void OnDestroy() { if(snowMesh) Destroy(snowMesh); }
    }
}
