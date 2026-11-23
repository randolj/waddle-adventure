using UnityEngine;

namespace Waddle {
    public sealed class SliceEffects : MonoBehaviour {
        float life, duration;
        Vector3 growth;
        Material material;
        Color color;
        bool additive;
        public static Material CreateGlowMaterial(Color color) {
            var m=new Material(Shader.Find("Universal Render Pipeline/Unlit")); m.color=color;
            m.SetFloat("_Surface",1); m.SetFloat("_SrcBlend",(float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend",(float)UnityEngine.Rendering.BlendMode.One); m.SetFloat("_ZWrite",0);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); m.renderQueue=3000; return m;
        }
        static Material Glow(Color color) {
            if(!SliceGame.Active || !SliceGame.Active.effectMaterial) return CreateGlowMaterial(color);
            var m=new Material(SliceGame.Active.effectMaterial); m.color=color; return m;
        }
        public static void Slash(Vector3 position,Vector3 forward,float radius,bool lunge) {
            Sweep(position,forward,radius,lunge?.34f:.25f,new Color(.12f,.65f,1,.19f),.23f,3000);
            Sweep(position,forward,radius,lunge?.2f:.12f,new Color(.25f,.88f,1,.68f),.18f,3001);
            Sweep(position,forward,radius,.035f,new Color(.72f,.98f,1,.9f),.12f,3002);
        }
        static void Sweep(Vector3 position,Vector3 forward,float radius,float thickness,Color color,float duration,int queue) {
            var go=new GameObject("Swept frost slash"); go.transform.position=position+Vector3.up*.65f;
            var mesh=new Mesh{name="Tapered sword crescent"}; var vertices=new Vector3[50]; var indices=new int[144];
            for(int i=0;i<25;i++) {
                float p=i/24f; Vector3 direction=Quaternion.Euler(0,-60+p*120,0)*forward;
                float width=Mathf.Sin(p*Mathf.PI)*thickness;
                vertices[i*2]=direction*(radius-width); vertices[i*2+1]=direction*(radius+.02f);
                if(i<24) { int k=i*6; indices[k]=i*2; indices[k+1]=i*2+1; indices[k+2]=i*2+2; indices[k+3]=i*2+1; indices[k+4]=i*2+3; indices[k+5]=i*2+2; }
            }
            mesh.vertices=vertices; mesh.triangles=indices; mesh.RecalculateNormals();
            go.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=go.AddComponent<MeshRenderer>(); var c=color; renderer.sharedMaterial=Glow(c); renderer.sharedMaterial.renderQueue=queue;
            renderer.sharedMaterial.SetFloat("_Cull",0);
            var fx=go.AddComponent<SliceEffects>(); fx.life=fx.duration=duration; fx.material=renderer.sharedMaterial; fx.color=c; fx.additive=true;
            fx.growth=Vector3.one*.5f;
        }
        public static void DashWake(Vector3 position,Vector3 direction) {
            var go=new GameObject("Dash ice wake"); var line=go.AddComponent<LineRenderer>();
            Vector3 side=Vector3.Cross(Vector3.up,direction)*Random.Range(-.2f,.2f);
            line.positionCount=2; line.SetPosition(0,position+Vector3.up*.3f+side);
            line.SetPosition(1,position+Vector3.up*.3f-direction*.65f+side); line.widthMultiplier=.055f;
            var c=new Color(.25f,.8f,1,.4f); line.sharedMaterial=Glow(c);
            var fx=go.AddComponent<SliceEffects>(); fx.life=fx.duration=.18f; fx.material=line.sharedMaterial; fx.color=c; fx.additive=true;
        }
        public static void Ring(Vector3 position, Color color, float radius = 1f, float duration = .3f) {
            var go = new GameObject("Impact ring");
            go.transform.position = position + Vector3.up * .07f;
            var line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = false; line.loop = true; line.positionCount = 48;
            line.widthMultiplier = .045f; line.sharedMaterial = new Material(SliceWorld.Material(color, true));
            for (int i = 0; i < 48; i++) {
                float a = i * Mathf.PI * 2 / 48;
                line.SetPosition(i, new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)) * radius);
            }
            var fx = go.AddComponent<SliceEffects>();
            fx.life = fx.duration = duration; fx.growth = Vector3.one * 3;
            fx.material = line.sharedMaterial; fx.color = color;
        }
        public static void Burst(Vector3 position, Color color, int count = 9) {
            for (int i = 0; i < count; i++) {
                var go = SliceWorld.Shape("Ice spark", PrimitiveType.Cube, null, position + Vector3.up * .6f,
                    Vector3.one * Random.Range(.045f, .12f), SliceWorld.Material(color, true));
                var fx = go.AddComponent<SliceEffects>();
                fx.life = fx.duration = Random.Range(.18f, .4f);
                fx.growth = new Vector3(Random.Range(-3f, 3f), Random.Range(1f, 4f), Random.Range(-3f, 3f));
            }
        }
        void Update() {
            if(SliceGame.Active && SliceGame.Active.Paused) return;
            life -= Time.deltaTime;
            if (life <= 0) {
                if (material) Destroy(material);
                var filter=GetComponent<MeshFilter>(); if(additive && filter) Destroy(filter.sharedMesh);
                Destroy(gameObject); return;
            }
            if (material) {
                transform.localScale += growth * Time.deltaTime;
                var c = color; if(additive) c.a*=life/duration; else { c*=life/duration; c.a=1; }
                material.color = c;
                if(!additive) material.SetColor("_EmissionColor",c*1.2f);
            } else {
                transform.position += growth * Time.deltaTime;
                growth += Vector3.down * Time.deltaTime * 8;
                transform.Rotate(180 * Time.deltaTime, 90 * Time.deltaTime, 0);
                transform.localScale *= Mathf.Pow(.05f, Time.deltaTime);
            }
        }
    }
}
