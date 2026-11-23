using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace Waddle {
    // Bone animation is evaluated explicitly by the simulation, including in deterministic tests.
    public sealed class SliceSkeleton : MonoBehaviour {
        public Animator animator;
        public AnimationClip idle, walk, slash, dash, hurt;
        public Transform rightHand, hips, torso, creatureHead;
        public float nominalSpeed=5, strideDistance=2.2f, walkStart=.04f, walkEnd=1.2f;
        public bool penguinWaddle=true;
        public float bodyWobble;
        public SliceFootIK FootIK { get; private set; }
        public float GaitPhase { get; private set; }
        public float LocomotionBlend => movement;
        public float ActionBlend => actionBlend;
        public float DashBlend => dashBlend;
        public bool Ready => graph.IsValid();
        public bool HasCombatClips => slash && dash && hurt;
        public float Clock { get; private set; }
        PlayableGraph graph;
        AnimationMixerPlayable locomotion, upperBody, walkCycle;
        AnimationLayerMixerPlayable layers;
        AnimationClipPlayable idlePose, walkPose, walkWrap, slashPose, dashPose, hurtPose;
        AvatarMask mask;
        float movement, actionBlend, dashBlend, hurtBlend, turn;
        Transform[] additiveBones;
        Quaternion[] baseRotations;
        Vector3[] basePositions;
        bool hasBasePose;

        public void Initialize() {
            if(Ready) return;
            if(!animator || !walk) { Debug.LogError("Skeletal prefab is missing its Animator or walk clip.",this); return; }
            animator.applyRootMotion=false; animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
            foreach(var skin in GetComponentsInChildren<SkinnedMeshRenderer>()) skin.updateWhenOffscreen=true;
            additiveBones=new[]{hips,torso,creatureHead}; baseRotations=new Quaternion[3]; basePositions=new Vector3[3];
            graph=PlayableGraph.Create(name+" · fixed-tick skeleton"); graph.SetTimeUpdateMode(DirectorUpdateMode.Manual);
            locomotion=AnimationMixerPlayable.Create(graph,2);
            idlePose=Create(idle?idle:walk); walkPose=Create(walk); walkWrap=Create(walk);
            walkCycle=AnimationMixerPlayable.Create(graph,2);
            graph.Connect(walkPose,0,walkCycle,0); graph.Connect(walkWrap,0,walkCycle,1);
            graph.Connect(idlePose,0,locomotion,0); graph.Connect(walkCycle,0,locomotion,1);
            layers=AnimationLayerMixerPlayable.Create(graph,3); graph.Connect(locomotion,0,layers,0); layers.SetInputWeight(0,1);
            if(HasCombatClips) {
                upperBody=AnimationMixerPlayable.Create(graph,2); slashPose=Create(slash); hurtPose=Create(hurt); dashPose=Create(dash);
                graph.Connect(slashPose,0,upperBody,0); graph.Connect(hurtPose,0,upperBody,1);
                graph.Connect(upperBody,0,layers,1); graph.Connect(dashPose,0,layers,2);
                // Clip bindings are relative to the Animator, not the scene hierarchy.
                // Build those exact paths; AddTransformPath on a runtime instance includes
                // its scene ancestors and silently masks out every animated bone.
                mask=new AvatarMask(); var bones=animator.GetComponentsInChildren<Transform>(); mask.transformCount=bones.Length;
                for(int i=0;i<bones.Length;i++) {
                    string path=""; var bone=bones[i];
                    while(bone!=animator.transform) { path=bone.name+(path.Length>0?"/"+path:""); bone=bone.parent; }
                    mask.SetTransformPath(i,path);
                    mask.SetTransformActive(i,path.Contains("Spine"));
                }
                layers.SetLayerMaskFromAvatarMask(1,mask);
            }
            var output=AnimationPlayableOutput.Create(graph,"Skeletal pose",animator); output.SetSourcePlayable(layers);
            graph.Play(); Pose(0,0,-1,-1,0);
            FootIK=GetComponent<SliceFootIK>(); if(FootIK) FootIK.Initialize(this);
        }
        AnimationClipPlayable Create(AnimationClip clip) {
            var p=AnimationClipPlayable.Create(graph,clip); p.SetSpeed(0); p.SetApplyFootIK(false); p.SetApplyPlayableIK(false); return p;
        }
        static float Blend(float value,float target,float dt,float seconds) => dt<=0?target:Mathf.MoveTowards(value,target,dt/seconds);
        public void Pose(float dt,float speed,float attackProgress,float dashProgress,float hurtAmount,Vector3 travel=default) {
            if(!Ready) return;
            Clock+=dt;
            float target=Mathf.Clamp01(speed); if(target<.025f) target=0;
            movement=Blend(movement,target,dt,target>movement?.09f:.13f);
            Vector3 localTravel=transform.InverseTransformDirection(travel);
            float direction=localTravel.z<-.1f?-1:1;
            // Phase follows measured motor travel, so standing still/pressing into cover cannot run the feet.
            GaitPhase=Mathf.Repeat(GaitPhase+(target==0?0:Mathf.Max(0,speed))*nominalSpeed*dt/Mathf.Max(.1f,strideDistance)*direction,1);
            idlePose.SetTime(idle?Clock%idle.length:walkStart);
            float end=walkEnd>walkStart?Mathf.Min(walkEnd,walk.length):walk.length;
            float length=Mathf.Max(.1f,end-walkStart), seam=Mathf.Min(.09f,length*.12f), cycle=length-seam;
            float time=GaitPhase*cycle, wrap=Mathf.Clamp01((time-(cycle-seam))/seam);
            walkPose.SetTime(walkStart+seam+time); walkWrap.SetTime(walkStart+wrap*seam);
            float seamBlend=Mathf.SmoothStep(0,1,wrap);
            walkCycle.SetInputWeight(0,1-seamBlend); walkCycle.SetInputWeight(1,seamBlend);
            locomotion.SetInputWeight(0,1-movement); locomotion.SetInputWeight(1,movement);
            if(HasCombatClips) {
                bool hit=hurtAmount>0, attacking=attackProgress>=0 && attackProgress<1;
                // Keep the last sampled action during blend-out instead of snapping back on the next tick.
                if(attacking) slashPose.SetTime(Mathf.Lerp(.8f,3.3f,Mathf.Clamp01(attackProgress)));
                if(hit) hurtPose.SetTime(Mathf.Clamp01(1-hurtAmount/.2f)*1.2f);
                actionBlend=Blend(actionBlend,attacking?1:0,dt,attacking?.035f:.085f);
                hurtBlend=Blend(hurtBlend,hit?1:0,dt,hit?.025f:.075f);
                float attackWeight=actionBlend*(1-hurtBlend), total=attackWeight+hurtBlend;
                upperBody.SetInputWeight(0,total>0?attackWeight/total:1); upperBody.SetInputWeight(1,total>0?hurtBlend/total:0);
                layers.SetInputWeight(1,Mathf.Clamp01(total));
                bool dashing=dashProgress>=0 && dashProgress<1;
                if(dashing) dashPose.SetTime(Mathf.Lerp(.1f,.8f,Mathf.Clamp01(dashProgress)));
                dashBlend=Blend(dashBlend,dashing?1:0,dt,dashing?.035f:.08f);
                layers.SetInputWeight(2,dashBlend);
            }
            // Constant clip channels may be stripped by import. Restore our own offsets
            // before evaluation so an unanimated bone cannot accumulate recoil each tick.
            if(FootIK) FootIK.RestorePose();
            RestoreAdditivePose(); graph.Evaluate(0);
            for(int i=0;i<additiveBones.Length;i++) if(additiveBones[i]) {
                baseRotations[i]=additiveBones[i].localRotation; basePositions[i]=additiveBones[i].localPosition;
            }
            hasBasePose=true;
            if(penguinWaddle && hips && torso) {
                float targetTurn=travel.sqrMagnitude>.001f?Mathf.Clamp(Mathf.Atan2(localTravel.x,Mathf.Abs(localTravel.z))*Mathf.Rad2Deg,-28,28):0;
                turn=dt<=0?targetTurn:Mathf.Lerp(turn,targetTurn,1-Mathf.Exp(-16*dt));
                float weight=movement*(1-dashBlend), yaw=turn*weight;
                hips.rotation=Quaternion.AngleAxis(yaw,Vector3.up)*hips.rotation;
                // Counter-rotate the chest so aim remains readable while the lower body follows travel.
                torso.rotation=Quaternion.AngleAxis(-yaw,Vector3.up)*torso.rotation;
                float roll=Mathf.Sin(GaitPhase*Mathf.PI*2)*4.5f*weight*(1-actionBlend*.85f);
                torso.rotation=Quaternion.AngleAxis(roll,transform.forward)*torso.rotation;
            }
        }
        public void GroundFeet(float dt,bool airborne=false) {
            if(bodyWobble>0 && torso) {
                float sway=Mathf.Sin(GaitPhase*Mathf.PI*2)*bodyWobble*movement;
                torso.rotation=Quaternion.AngleAxis(sway,transform.forward)*torso.rotation;
            }
            if(FootIK) FootIK.Solve(dt,airborne || dashBlend>.25f);
        }
        void RestoreAdditivePose() {
            if(!hasBasePose) return;
            for(int i=0;i<additiveBones.Length;i++) if(additiveBones[i]) {
                additiveBones[i].localRotation=baseRotations[i]; additiveBones[i].localPosition=basePositions[i];
            }
        }
        public void CreatureReaction(float bite,float recoil) {
            if(!Ready || !creatureHead || !torso) return;
            RestoreAdditivePose();
            torso.rotation=Quaternion.AngleAxis(-bite*7-recoil*9,transform.right)*torso.rotation;
            creatureHead.rotation=Quaternion.AngleAxis(-bite*16+recoil*19,transform.right)*creatureHead.rotation;
            creatureHead.position+=transform.forward*(bite*.055f);
        }
        public void BindWeapon(Transform pivot) {
            if(!rightHand || !HasCombatClips) return;
            // Establish the grip in idle, then let the hand bone carry the independent weapon model.
            Quaternion worldRotation=transform.rotation;
            pivot.SetParent(rightHand,true); pivot.localPosition=Vector3.zero;
            pivot.rotation=worldRotation*Quaternion.Euler(-10,0,0);
            if(pivot.childCount>0) pivot.GetChild(0).localPosition=new Vector3(0,0,-.17f);
        }
        void OnDestroy() { if(graph.IsValid()) graph.Destroy(); if(mask) Destroy(mask); }
    }
}
