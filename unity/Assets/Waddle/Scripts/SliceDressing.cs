using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Waddle {
    // Decorative geometry only. Existing room collision remains the gameplay boundary.
    public static class SliceDressing {
        static int snowId;
        public static void Reset() { snowId=0; }
        public static GameObject Snow(Transform parent,Vector3 position,Vector3 size,Material material) {
            var v=new List<Vector3>(); var triangles=new List<int>(); const int segments=24;
            v.Add(new Vector3(0,.7f,0));
            for(int ring=0;ring<2;ring++) for(int i=0;i<segments;i++) {
                float a=i*Mathf.PI*2/segments, r=(ring==0?.67f:1)*Random.Range(.91f,1.09f);
                v.Add(new Vector3(Mathf.Sign(Mathf.Cos(a))*Mathf.Pow(Mathf.Abs(Mathf.Cos(a)),.65f)*r*.5f,ring==0?Random.Range(.4f,.52f):Random.Range(-.07f,.025f),Mathf.Sign(Mathf.Sin(a))*Mathf.Pow(Mathf.Abs(Mathf.Sin(a)),.65f)*r*.5f));
            }
            for(int i=0;i<segments;i++) {
                int a=1+i,b=1+(i+1)%segments,c=a+segments,d=b+segments;
                triangles.AddRange(new[]{0,b,a,a,b,c,b,d,c});
            }
            var mesh=new Mesh{name="Sculpted_snow_"+snowId++}; mesh.SetVertices(v); mesh.SetTriangles(triangles,0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
            return MeshObject("Sculpted snow drift",parent,position,size,mesh,material);
        }
        public static GameObject MeshObject(string name,Transform parent,Vector3 position,Vector3 scale,Mesh mesh,Material material) {
            var go=SliceWorld.Group(name,parent,position).gameObject; go.transform.localScale=scale;
            go.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=go.AddComponent<MeshRenderer>(); renderer.sharedMaterial=material; return go;
        }
        public static Material SoftMaterial(string name,Color color,bool shadow=false,bool portal=false) {
            var material=new Material(Shader.Find("Waddle/Soft atmosphere")){name=name}; material.color=color;
            material.SetFloat("_DstBlend",shadow?(float)BlendMode.OneMinusSrcAlpha:(float)BlendMode.One);
            material.SetFloat("_Portal",portal?1:0); return material;
        }
        public static Mesh Quad(string name) {
            var mesh=new Mesh{name=name}; mesh.vertices=new[]{new Vector3(-.5f,-.5f,0),new Vector3(.5f,-.5f,0),new Vector3(.5f,.5f,0),new Vector3(-.5f,.5f,0)};
            mesh.uv=new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up}; mesh.colors=new[]{Color.white,Color.white,Color.white,Color.white};
            mesh.triangles=new[]{0,1,2,0,2,3}; mesh.RecalculateNormals(); return mesh;
        }
        static void Line(string name,Transform parent,Vector3[] points,Material material,float width,bool loop=false) {
            var line=SliceWorld.Group(name,parent,Vector3.zero).gameObject.AddComponent<LineRenderer>(); line.useWorldSpace=false;
            line.positionCount=points.Length; line.SetPositions(points); line.widthMultiplier=width; line.loop=loop; line.sharedMaterial=material;
        }
        public static void Build(Transform parent,SliceGame game,Material snow,Material stone,Material dark) {
            var root=SliceWorld.Group("Frostvault · sculpted detail",parent,Vector3.zero);
            var frost=SliceWorld.Material(new Color(.32f,.67f,.77f)); var rune=SliceWorld.Material(new Color(.09f,.51f,.62f),true);
            // Accumulation stays at the perimeter, with small shallow patches at pillar feet.
            for(int side=-1;side<=1;side+=2) for(int z=-6;z<=6;z+=2) {
                Snow(root,new Vector3(side*9.95f,.045f,z),new Vector3(1.05f,.3f,2.9f),snow);
                for(int i=0;i<3;i++) {
                    var rubble=SliceWorld.Shape("Fallen frost masonry",PrimitiveType.Cube,root,new Vector3(side*Random.Range(9.5f,10.1f),.13f,z+Random.Range(-.7f,.7f)),new Vector3(.24f,.22f,.38f),stone);
                    rubble.transform.rotation=Quaternion.Euler(Random.Range(-15,20),Random.Range(0,180),Random.Range(-15,15));
                }
            }
            for(int x=-8;x<=8;x+=2) if(Mathf.Abs(x)>2) Snow(root,new Vector3(x,.04f,7.3f),new Vector3(2.8f,.24f,1.1f),snow);
            foreach(var p in new[]{new Vector3(-5,0,1.4f),new Vector3(5,0,1.4f),new Vector3(-6,0,-4.7f),new Vector3(6,0,-4.7f)}) {
                Snow(root,p+new Vector3(.45f,.045f,.25f),new Vector3(1.95f,.17f,1.6f),snow);
                for(int side=-1;side<=1;side+=2) {
                    var strip=SliceWorld.Shape("Pillar carved corner",PrimitiveType.Cube,root,p+new Vector3(side*.49f,1.2f,-.59f),new Vector3(.12f,1.45f,.12f),dark);
                    if(side<0) continue;
                    var gem=SliceWorld.Shape("Pillar frost seal",PrimitiveType.Cube,root,p+new Vector3(0,1.97f,-.61f),new Vector3(.2f,.2f,.07f),frost);
                    gem.transform.localRotation=Quaternion.Euler(0,0,45);
                }
            }
            // Snow-covered buttresses and icicles break up the long, regular wall silhouette.
            for(int side=-1;side<=1;side+=2) for(int x=3;x<=9;x+=3) {
                var pier=SliceWorld.Group("Back wall buttress",root,new Vector3(side*x,0,7.65f));
                SliceWorld.Shape("Buttress foot",PrimitiveType.Cube,pier,new Vector3(0,.2f,0),new Vector3(.85f,.4f,1.1f),dark);
                SliceWorld.Shape("Buttress shaft",PrimitiveType.Cube,pier,new Vector3(0,1.5f,0),new Vector3(.55f,2.65f,.65f),stone);
                Snow(pier,new Vector3(0,2.85f,0),new Vector3(.9f,.34f,1),snow);
            }
            for(int x=-10;x<=10;x++) if(Mathf.Abs(x)>2) {
                var icicle=SliceWorld.Shape("Hanging icicle",PrimitiveType.Capsule,root,new Vector3(x,2.2f,7.48f),new Vector3(.07f,Random.Range(.16f,.4f),.07f),frost);
                icicle.transform.localRotation=Quaternion.Euler(0,0,Random.Range(-10,10));
            }
            // Frame the gateway with a pointed arch and a carved, illuminated key stone.
            for(int side=-1;side<=1;side+=2) {
                var arch=SliceWorld.Shape("Gateway sloping arch",PrimitiveType.Cube,root,new Vector3(side*.83f,3.14f,7.9f),new Vector3(2.0f,.38f,1.05f),stone);
                arch.transform.localRotation=Quaternion.Euler(0,0,-side*29);
                Snow(arch.transform,new Vector3(0,.22f,0),new Vector3(2.1f,.22f,1.15f),snow);
                Line("Gateway inlaid rune",root,new[]{new Vector3(side*1.34f,.15f,7.4f),new Vector3(side*1.34f,2.5f,7.4f),new Vector3(0,3.28f,7.4f)},rune,.045f);
            }
            var crest=SliceWorld.Shape("Gateway diamond seal",PrimitiveType.Cube,root,new Vector3(0,3.5f,7.35f),new Vector3(.4f,.4f,.15f),rune);
            crest.transform.localRotation=Quaternion.Euler(0,0,45);
            for(int side=-1;side<=1;side+=2) Banner(root,new Vector3(side*3.2f,1.6f,7.24f));
            // A worn extraction seal sits flush with the floor, below feet and attack tells.
            var seal=new Vector3[64];
            for(int i=0;i<seal.Length;i++) { float a=i*Mathf.PI*2/seal.Length; seal[i]=new Vector3(Mathf.Cos(a)*1.13f,.077f,Mathf.Sin(a)*1.13f+6.65f); }
            Line("Extraction floor seal",root,seal,rune,.018f,true);
            var atmosphere=SliceWorld.Group("Frostvault · living atmosphere",parent,Vector3.zero).gameObject.AddComponent<SliceAtmosphere>();
            game.atmosphere=atmosphere; atmosphere.Build(game);
        }
        static void Banner(Transform parent,Vector3 position) {
            var cloth=SliceWorld.Material(new Color(.34f,.07f,.095f)); var trim=SliceWorld.Material(new Color(.62f,.47f,.3f));
            var mesh=new Mesh{name="Swallowtail_banner"};
            mesh.vertices=new[]{new Vector3(-.45f,.8f,0),new Vector3(.45f,.8f,0),new Vector3(.45f,-.8f,.08f),new Vector3(0,-.55f,.03f),new Vector3(-.45f,-.8f,.08f)};
            mesh.triangles=new[]{0,1,3,1,2,3,0,3,4}; mesh.RecalculateNormals();
            MeshObject("Weathered crimson banner",parent,position,Vector3.one,mesh,cloth);
            SliceWorld.Shape("Banner crossbar",PrimitiveType.Cube,parent,position+Vector3.up*.8f,new Vector3(1.1f,.08f,.12f),trim);
            var center=position+new Vector3(0,.1f,-.025f);
            for(int i=0;i<3;i++) {
                var mark=SliceWorld.Shape("Banner snowflake embroidery",PrimitiveType.Cube,parent,center,new Vector3(.055f,.62f,.018f),trim);
                mark.transform.localRotation=Quaternion.Euler(0,0,i*60);
            }
        }
    }
}
