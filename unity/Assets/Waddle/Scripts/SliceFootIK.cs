using System;
using UnityEngine;

namespace Waddle {
    // Generic-rig, analytic two-bone grounding. Evaluated after animation and body posing.
    public sealed class SliceFootIK : MonoBehaviour {
        [Serializable] public sealed class Leg {
            public Transform upper, lower, foot;
            public float phaseOffset, outward;
            [NonSerialized] public Vector3 Target, Normal, Anchor;
            [NonSerialized] public bool Planted, Hit;
            [NonSerialized] public float Sole, Weight, Error;
            [NonSerialized] public Quaternion upperPose, lowerPose, footPose;
            [NonSerialized] public Vector3 upperPosition, lowerPosition, footPosition;
            [NonSerialized] public bool saved;
        }
        public Leg[] legs=Array.Empty<Leg>();
        public float surfaceOffset=.045f, maxStep=.18f, maxCorrection=.2f, soleTilt=18;
        public int groundMask=1<<6;
        public int GroundHits { get; private set; }
        public float Weight { get; private set; }
        public bool Ready { get; private set; }
        Transform actor;
        Vector3 previousActor;
        Quaternion previousHeading;
        SliceSkeleton skeleton;
        public void Initialize(SliceSkeleton owner) {
            if(Ready) return;
            skeleton=owner;
            var motor=GetComponentInParent<CharacterController>(); actor=motor?motor.transform:transform;
            foreach(var leg in legs) {
                if(!leg.upper || !leg.lower || !leg.foot) throw new InvalidOperationException("Incomplete foot IK chain: "+name);
                leg.Sole=Mathf.Clamp(leg.foot.position.y-actor.position.y,.035f,.32f);
                leg.Normal=Vector3.up;
            }
            previousActor=actor.position; previousHeading=actor.rotation; Ready=legs.Length>0;
        }
        public void RestorePose() {
            foreach(var leg in legs) if(leg.saved) {
                leg.upper.localRotation=leg.upperPose; leg.lower.localRotation=leg.lowerPose; leg.foot.localRotation=leg.footPose;
                leg.upper.localPosition=leg.upperPosition; leg.lower.localPosition=leg.lowerPosition; leg.foot.localPosition=leg.footPosition;
                leg.saved=false;
            }
        }
        public void Solve(float dt,bool airborne=false) {
            if(!Ready) return;
            // Repeated evaluations of the same simulation pose remain safe.
            RestorePose(); GroundHits=0;
            bool reset=(actor.position-previousActor).magnitude>.65f || Quaternion.Angle(previousHeading,actor.rotation)>35;
            previousActor=actor.position; previousHeading=actor.rotation;
            Weight=dt<=0?(airborne?0:1):Mathf.MoveTowards(Weight,airborne?0:1,dt/(airborne?.035f:.08f));
            foreach(var leg in legs) {
                leg.upperPose=leg.upper.localRotation; leg.lowerPose=leg.lower.localRotation; leg.footPose=leg.foot.localRotation;
                leg.upperPosition=leg.upper.localPosition; leg.lowerPosition=leg.lower.localPosition; leg.footPosition=leg.foot.localPosition; leg.saved=true;
                Vector3 animated=leg.foot.position;
                float side=Mathf.Sign(actor.InverseTransformPoint(animated).x);
                Vector3 sample=animated+actor.right*(side*leg.outward);
                float lift=Mathf.Max(0,animated.y-actor.position.y-leg.Sole);
                float phase=Mathf.Repeat(skeleton.GaitPhase+leg.phaseOffset,1);
                bool stance=skeleton.LocomotionBlend<.1f || (phase<.58f && lift<.045f);
                float reach=Vector3.Distance(leg.upper.position,leg.lower.position)+Vector3.Distance(leg.lower.position,animated);
                float lockRadius=Mathf.Min(.16f,reach*.35f);
                if(reset || airborne || !stance || (leg.Anchor-sample).sqrMagnitude>lockRadius*lockRadius
                    || Vector3.Distance(leg.upper.position,leg.Anchor)>reach*.995f) leg.Planted=false;
                // A planted sole samples its anchored surface, not terrain moving past the animated foot.
                Vector3 probe=leg.Planted?leg.Anchor:sample;
                Vector3 origin=new Vector3(probe.x,actor.position.y+.65f,probe.z);
                bool hit=Physics.Raycast(origin,Vector3.down,out var ground,1.15f,groundMask,QueryTriggerInteraction.Ignore)
                    && ground.normal.y>.7f && Mathf.Abs(ground.point.y-actor.position.y)<maxStep;
                leg.Hit=hit;
                if(hit) {
                    GroundHits++;
                    Vector3 target=sample; target.y=ground.point.y+surfaceOffset+leg.Sole+(stance?0:lift);
                    if(stance && !airborne) {
                        if(!leg.Planted) { leg.Anchor=target; leg.Planted=true; }
                        target.x=leg.Anchor.x; target.z=leg.Anchor.z;
                    }
                    // Never chase a wall top or force a short leg beyond a modest correction.
                    leg.Target=animated+Vector3.ClampMagnitude(target-animated,maxCorrection+leg.outward);
                    leg.Normal=Vector3.RotateTowards(Vector3.up,ground.normal,soleTilt*Mathf.Deg2Rad,0);
                } else leg.Planted=false;
                leg.Weight=dt<=0?(hit?1:0):Mathf.MoveTowards(leg.Weight,hit?1:0,dt/.075f);
                float weight=leg.Weight*Weight;
                if(weight<=0) continue;
                Quaternion sole=Quaternion.FromToRotation(Vector3.up,leg.Normal)*leg.foot.rotation;
                SolveTwoBone(leg.upper,leg.lower,leg.foot,leg.Target,sole);
                var u=leg.upper.localRotation; var l=leg.lower.localRotation; var f=leg.foot.localRotation;
                leg.upper.localRotation=Quaternion.Slerp(leg.upperPose,u,weight);
                leg.lower.localRotation=Quaternion.Slerp(leg.lowerPose,l,weight);
                leg.foot.localRotation=Quaternion.Slerp(leg.footPose,f,weight);
                leg.Error=Vector3.Distance(leg.foot.position,leg.Target);
            }
        }
        public static void SolveTwoBone(Transform upper,Transform lower,Transform foot,Vector3 target,Quaternion sole) {
            Vector3 a=upper.position,b=lower.position,c=foot.position;
            float first=Vector3.Distance(a,b),second=Vector3.Distance(b,c);
            if(first<.0001f || second<.0001f) return;
            Vector3 delta=target-a; float distance=delta.magnitude;
            Vector3 direction=distance>.0001f?delta/distance:Vector3.down;
            distance=Mathf.Clamp(distance,Mathf.Abs(first-second)+.00001f,first+second-.00001f);
            Vector3 bend=Vector3.ProjectOnPlane(b-a,direction);
            if(bend.sqrMagnitude<1e-8f) bend=Vector3.ProjectOnPlane(upper.forward,direction);
            if(bend.sqrMagnitude<1e-8f) bend=Vector3.ProjectOnPlane(upper.right,direction);
            bend.Normalize();
            float along=(first*first+distance*distance-second*second)/(2*distance);
            Vector3 knee=a+direction*along+bend*Mathf.Sqrt(Mathf.Max(0,first*first-along*along));
            upper.rotation=Quaternion.FromToRotation(b-a,knee-a)*upper.rotation;
            lower.rotation=Quaternion.FromToRotation(foot.position-lower.position,a+direction*distance-lower.position)*lower.rotation;
            foot.rotation=sole;
        }
    }
}
