using UnityEngine;

namespace Waddle {
    // Driven by the game tick so pause, deterministic checks and presentation agree.
    public sealed class SliceChest : MonoBehaviour {
        public Transform lid;
        public Light rewardLight;
        public bool IsOpen { get; private set; }
        public bool Opening { get; private set; }
        public const float OpenDuration=.65f;
        float age, openTime;
        public void Reveal() {
            age=0; openTime=0; Opening=false; IsOpen=false;
            gameObject.SetActive(true); transform.localScale=Vector3.one*.02f;
        }
        public void Open() {
            if(IsOpen || Opening) return;
            Opening=true; openTime=0;
            SliceEffects.Ring(transform.position,new Color(1,.7f,.28f),.45f,.55f);
        }
        public void Tick(float dt) {
            if(!gameObject.activeSelf) return;
            age+=dt;
            float reveal=Mathf.Clamp01(age/.35f);
            transform.localScale=Vector3.one*Mathf.Lerp(.02f,1,1-Mathf.Pow(1-reveal,3));
            if(Opening) {
                openTime+=dt;
                float p=Mathf.Clamp01(openTime/OpenDuration);
                lid.localRotation=Quaternion.Euler(105*Mathf.SmoothStep(0,1,p),0,0);
                if(rewardLight) rewardLight.intensity=3+Mathf.Sin(p*Mathf.PI)*4;
                if(p>=1) { Opening=false; IsOpen=true; SliceEffects.Burst(transform.position,new Color(1,.72f,.25f),16); }
            }
            if(!Opening && rewardLight) rewardLight.intensity=IsOpen?1.5f:2.4f+Mathf.Sin(age*2)*.3f;
        }
    }
}
