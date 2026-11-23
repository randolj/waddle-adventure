using UnityEngine;

namespace Waddle {
    public struct SliceCommand {
        public Vector3 move, aim;
        public bool dash, attack;
    }
    public sealed class SlicePlayer : MonoBehaviour {
        public SliceGame game;
        public Transform visual, weaponPivot;
        public SliceSkeleton Skeleton { get; private set; }
        public int Health { get; private set; }
        public bool Dead => Health<=0;
        public bool Dashing => dashTime>0;
        public float DashReady => 1-Mathf.Clamp01(dashRest/game.tuning.dashRest);
        public Vector3 Facing { get; private set; }=Vector3.back;
        public bool LastAttackWasLunge { get; private set; }
        Vector3 velocity, dashDirection, impulse, attackDirection;
        float dashTime, dashRest, strikeWindow, attackRest, swing, invulnerable, gait;
        float attackBuffer, dashBuffer, trailClock, hurtPose, locomotion;
        int swingSide=1;
        bool hitPending;
        CharacterController motor;
        Renderer[] renderers;
        MaterialPropertyBlock tint;
        Quaternion presentationHeading;
        public void Initialize(SliceGame owner) {
            presentationHeading=transform.rotation;
            game=owner; Health=game.tuning.maxHealth;
            motor=GetComponent<CharacterController>(); renderers=visual.GetComponentsInChildren<Renderer>(); tint=new MaterialPropertyBlock();
            Skeleton=visual.GetComponentInChildren<SliceSkeleton>();
            if(Skeleton) { Skeleton.Initialize(); Skeleton.BindWeapon(weaponPivot); }
        }
        public void Heal() { Health=game.tuning.maxHealth; }
        public void ResetAt(Vector3 position) {
            motor.enabled=false; transform.position=position; transform.rotation=Quaternion.identity; motor.enabled=true;
            Heal(); velocity=impulse=Vector3.zero; dashTime=dashRest=strikeWindow=attackRest=swing=invulnerable=0;
            attackBuffer=dashBuffer=hurtPose=locomotion=0; hitPending=false; Facing=Vector3.back;
            presentationHeading=Quaternion.identity; visual.localPosition=Vector3.zero; visual.localScale=Vector3.one;
            if(Skeleton) Skeleton.Pose(0,0,-1,-1,0);
        }
        public void Tick(float dt,SliceCommand command) {
            if(Dead) return;
            var t=game.tuning;
            dashRest=Mathf.Max(0,dashRest-dt); strikeWindow=Mathf.Max(0,strikeWindow-dt);
            attackRest=Mathf.Max(0,attackRest-dt); invulnerable=Mathf.Max(0,invulnerable-dt);
            attackBuffer=Mathf.Max(0,attackBuffer-dt); dashBuffer=Mathf.Max(0,dashBuffer-dt); hurtPose=Mathf.Max(0,hurtPose-dt);
            if(command.attack) attackBuffer=t.inputBuffer;
            if(command.dash) dashBuffer=t.inputBuffer;
            // Commit each swing to one direction instead of dragging its hit cone with the cursor.
            if(command.aim.sqrMagnitude>.01f && swing<=0 && dashTime<=0) Facing=command.aim.normalized;
            if(dashBuffer>0 && dashTime<=0 && dashRest<=0) {
                dashBuffer=0; dashDirection=command.move.sqrMagnitude>.01f?command.move.normalized:Facing;
                Facing=dashDirection; dashTime=t.dashDuration; strikeWindow=dashTime+t.strikeGrace;
                invulnerable=dashTime+.06f; swing=0; hitPending=false; impulse=Vector3.zero; trailClock=0;
                SliceEffects.Ring(transform.position,SliceWorld.Cyan,.3f,.25f); game.PlayTone(340,.12f,.1f);
            }
            if(attackBuffer>0 && (attackRest<=0 || strikeWindow>0)) {
                attackBuffer=0; LastAttackWasLunge=strikeWindow>0;
                if(LastAttackWasLunge) {
                    Facing=dashDirection; dashTime=0; dashRest=t.dashRest;
                    impulse=Facing*t.lungeSpeed; strikeWindow=0; invulnerable=.24f;
                }
                attackDirection=Facing; swingSide=-swingSide;
                swing=t.attackDuration; attackRest=t.attackCooldown; hitPending=true;
                game.PlayTone(LastAttackWasLunge?165:230,.12f,.08f);
            }
            Vector3 movementStart=transform.position;
            bool movedByDash=dashTime>0;
            Vector3 desired=Vector3.ClampMagnitude(command.move,1)*t.moveSpeed;
            if(dashTime>0) {
                motor.Move(dashDirection*(t.dashSpeed*dt)); dashTime=Mathf.Max(0,dashTime-dt);
                if(dashTime<=0) dashRest=t.dashRest;
            } else {
                velocity=Vector3.Lerp(velocity,desired,1-Mathf.Exp(-t.acceleration*dt));
                motor.Move((velocity+impulse+Vector3.down*2)*dt); impulse*=Mathf.Exp(-7.4f*dt);
            }
            var pos=transform.position; pos.y=0; transform.position=pos;
            if(dashTime>0 || impulse.magnitude>4) {
                trailClock-=dt;
                if(trailClock<=0) { trailClock=.035f; SliceEffects.DashWake(transform.position,Facing); }
            }
            float attackPose=0, attackProgress=-1;
            if(swing>0) {
                swing=Mathf.Max(0,swing-dt); float p=1-swing/t.attackDuration; attackProgress=p;
                float yaw=p<.2f?Mathf.Lerp(22,-85,p/.2f):p<.58f?Mathf.Lerp(-85,82,Mathf.SmoothStep(0,1,(p-.2f)/.38f)):Mathf.Lerp(82,22,Mathf.SmoothStep(0,1,(p-.58f)/.42f));
                if(!Skeleton) weaponPivot.localRotation=Quaternion.Euler(-12,yaw*swingSide,-12*swingSide);
                Facing=attackDirection; attackPose=Mathf.Sin(p*Mathf.PI);
                if(hitPending && p>=.42f) { hitPending=false; ResolveAttack(); }
            } else if(!Skeleton) weaponPivot.localRotation=Quaternion.Slerp(weaponPivot.localRotation,Quaternion.Euler(-8,22,0),1-Mathf.Exp(-18*dt));
            transform.rotation=Quaternion.LookRotation(Facing);
            locomotion=Mathf.MoveTowards(locomotion,Mathf.Clamp01(velocity.magnitude/t.moveSpeed),dt*9);
            gait+=locomotion*dt*14;
            float dashPose=dashTime>0?1:0;
            if(Skeleton && Skeleton.Ready) {
                presentationHeading=Quaternion.RotateTowards(presentationHeading,transform.rotation,(Dashing?1800:1080)*dt);
                visual.localPosition=Vector3.zero; visual.rotation=presentationHeading; visual.localScale=Vector3.one;
                Vector3 travel=transform.position-movementStart; travel.y=0;
                float actualSpeed=dt>0?travel.magnitude/dt:0;
                float gaitSpeed=movedByDash?0:Mathf.Min(velocity.magnitude,actualSpeed)/t.moveSpeed;
                Skeleton.Pose(dt,gaitSpeed,attackProgress,dashTime>0?1-dashTime/t.dashDuration:-1,hurtPose,travel);
                Skeleton.GroundFeet(dt,movedByDash);
            } else {
            visual.localPosition=Vector3.up*(Mathf.Abs(Mathf.Sin(gait))*.035f*locomotion)-Vector3.forward*(hurtPose*.22f);
            var pose=Quaternion.Euler(dashPose*20+attackPose*8-hurtPose*24,attackPose*swingSide*9,Mathf.Sin(gait)*5*locomotion+hurtPose*12);
            visual.localRotation=Quaternion.Slerp(visual.localRotation,pose,1-Mathf.Exp(-22*dt));
            visual.localScale=Vector3.Lerp(visual.localScale,new Vector3(1-dashPose*.07f,1-dashPose*.09f,1+dashPose*.14f),1-Mathf.Exp(-24*dt));
            }
            foreach(var r in renderers) { tint.SetColor("_EmissionColor",hurtPose>0?new Color(.45f,.13f,.1f)*hurtPose*4:Color.black); r.SetPropertyBlock(tint); }
        }
        void ResolveAttack() {
            var t=game.tuning; Vector3 center=transform.position;
            game.Slash(center,Facing,t.attackRange,LastAttackWasLunge);
            foreach(var enemy in game.enemies) {
                if(!enemy || !enemy.gameObject.activeInHierarchy || enemy.Dead) continue;
                Vector3 delta=enemy.transform.position-center; delta.y=0;
                if(delta.magnitude>t.attackRange+.35f || Vector3.Angle(Facing,delta)>t.attackArc*.5f) continue;
                if(Physics.Linecast(center+Vector3.up*.6f,enemy.transform.position+Vector3.up*.6f,1<<6)) continue;
                enemy.TakeHit(LastAttackWasLunge?Mathf.RoundToInt(t.damage*1.7f):t.damage,Facing);
                game.Impact(LastAttackWasLunge?.09f:.045f);
            }
        }
        public void Hurt(int amount) {
            if(invulnerable>0 || Dead || game.InCamp || game.state!=SliceGame.RunState.Fighting) return;
            Health=Mathf.Max(0,Health-amount); invulnerable=.65f; hurtPose=.2f;
            game.Impact(.10f); SliceEffects.Burst(transform.position,new Color(1,.3f,.25f)); game.PlayTone(85,.16f,.11f);
            if(Dead) game.Lose();
        }
    }
}
