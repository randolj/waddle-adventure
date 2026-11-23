using UnityEngine;
using UnityEngine.Rendering;

namespace Waddle {
    // A single batched frost mesh and a simulation clock: no per-particle objects or physics.
    public sealed class SliceAtmosphere : MonoBehaviour {
        public MeshFilter frost;
        public Renderer portalSurface;
        public Light[] lanterns;
        public Camera viewCamera;
        public float Clock { get; private set; }
        const int Count=96;
        Mesh mesh;
        Vector3[] vertices;
        float[] lanternStrength;
        MaterialPropertyBlock portalProperties;
        static float Hash(int i) => Mathf.Repeat(Mathf.Sin(i*127.1f+311.7f)*43758.5453f,1);
        public void Build(SliceGame game) {
            viewCamera=game.viewCamera;
            lanterns=System.Array.FindAll(game.GetComponentsInChildren<Light>(),l=>l.name=="Warm lantern pool");
            var soft=SliceDressing.SoftMaterial("Frost mote glow",new Color(.6f,.84f,1,.62f));
            mesh=new Mesh{name="Batched frost motes"};
            vertices=new Vector3[Count*4]; var uv=new Vector2[Count*4]; var colors=new Color[Count*4]; var triangles=new int[Count*6];
            for(int i=0;i<Count;i++) {
                int v=i*4,t=i*6;
                uv[v]=Vector2.zero; uv[v+1]=Vector2.right; uv[v+2]=Vector2.one; uv[v+3]=Vector2.up;
                for(int n=0;n<4;n++) colors[v+n]=new Color(1,1,1,Mathf.Lerp(.18f,.7f,Hash(i+9)));
                triangles[t]=v; triangles[t+1]=v+1; triangles[t+2]=v+2; triangles[t+3]=v; triangles[t+4]=v+2; triangles[t+5]=v+3;
            }
            mesh.vertices=vertices; mesh.uv=uv; mesh.colors=colors; mesh.triangles=triangles;
            frost=SliceDressing.MeshObject("Drifting frost · one draw",transform,Vector3.zero,Vector3.one,mesh,soft).GetComponent<MeshFilter>();
            var renderer=frost.GetComponent<Renderer>(); renderer.shadowCastingMode=ShadowCastingMode.Off; renderer.receiveShadows=false;
            var portalMesh=new Mesh{name="Pointed gateway veil"};
            portalMesh.vertices=new[]{new Vector3(-1.25f,0,0),new Vector3(1.25f,0,0),new Vector3(1.25f,2.5f,0),new Vector3(0,3.2f,0),new Vector3(-1.25f,2.5f,0)};
            portalMesh.uv=new[]{Vector2.zero,Vector2.right,new Vector2(1,.78f),new Vector2(.5f,1),new Vector2(0,.78f)};
            portalMesh.colors=new[]{Color.white,Color.white,Color.white,Color.white,Color.white};
            portalMesh.triangles=new[]{0,1,2,0,2,4,2,3,4}; portalMesh.RecalculateNormals();
            portalSurface=SliceDressing.MeshObject("Flowing extraction veil",transform,new Vector3(0,0,7.48f),Vector3.one,portalMesh,
                SliceDressing.SoftMaterial("Gateway flowing cyan",new Color(.12f,.85f,1,.7f),false,true)).GetComponent<Renderer>();
            portalSurface.shadowCastingMode=ShadowCastingMode.Off;
            var haze=SliceDressing.SoftMaterial("Amber lantern haze",new Color(1,.5f,.12f,.11f));
            foreach(var light in lanterns) {
                var go=SliceDressing.MeshObject("Soft amber source halo",transform,light.transform.position,Vector3.one*1.55f,SliceDressing.Quad("Halo quad"),haze);
                go.transform.rotation=viewCamera.transform.rotation; go.GetComponent<Renderer>().shadowCastingMode=ShadowCastingMode.Off;
            }
            var shadow=SliceDressing.SoftMaterial("Soft character contact",new Color(.01f,.025f,.05f,.34f),true);
            Contact(game.player.transform,1.3f,shadow);
            foreach(var enemy in game.enemies) Contact(enemy.transform,enemy.kind==SliceEnemy.Kind.Charger?2.3f:1.05f,shadow);
            DrawFrost();
        }
        static void Contact(Transform actor,float size,Material material) {
            var shadow=SliceDressing.MeshObject("Soft ground contact",actor,new Vector3(0,.078f,0),new Vector3(size,size*.8f,1),SliceDressing.Quad("Contact shadow quad"),material);
            shadow.transform.localRotation=Quaternion.Euler(90,0,0); var renderer=shadow.GetComponent<Renderer>(); renderer.shadowCastingMode=ShadowCastingMode.Off; renderer.receiveShadows=false;
        }
        void Initialize() {
            if(portalProperties!=null) return;
            mesh=Instantiate(frost.sharedMesh); mesh.name="Runtime frost batch"; frost.sharedMesh=mesh; mesh.MarkDynamic();
            vertices=new Vector3[Count*4]; lanternStrength=new float[lanterns.Length];
            for(int i=0;i<lanterns.Length;i++) lanternStrength[i]=lanterns[i].intensity;
            portalProperties=new MaterialPropertyBlock();
        }
        public void Tick(float dt) {
            Initialize(); Clock+=dt; DrawFrost();
            for(int i=0;i<lanterns.Length;i++) lanterns[i].intensity=lanternStrength[i]*(1+Mathf.Sin(Clock*2.3f+i*1.7f)*.035f+Mathf.Sin(Clock*5.1f+i)*.018f);
            portalProperties.SetFloat("_Phase",Clock); portalSurface.SetPropertyBlock(portalProperties);
        }
        void DrawFrost() {
            Vector3 right=viewCamera.transform.right,up=viewCamera.transform.up;
            for(int i=0;i<Count;i++) {
                float seed=Hash(i), phase=Clock*(.12f+Hash(i+4)*.14f);
                var center=new Vector3(Mathf.Repeat(seed*22+Clock*.13f,22)-11,Mathf.Repeat(Hash(i+1)*3.5f-phase,3.5f)+.2f,Hash(i+2)*15-7.5f);
                center.x+=Mathf.Sin(Clock*.7f+i)*.14f;
                float size=Mathf.Lerp(.018f,.05f,Hash(i+3)); var x=right*size; var y=up*size;
                int v=i*4; vertices[v]=center-x-y; vertices[v+1]=center+x-y; vertices[v+2]=center+x+y; vertices[v+3]=center-x+y;
            }
            mesh.vertices=vertices; mesh.RecalculateBounds();
        }
        void OnDestroy() { if(Application.isPlaying && mesh) Destroy(mesh); }
    }
}
