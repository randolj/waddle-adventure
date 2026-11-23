using UnityEngine;

namespace Waddle {
    public sealed class SliceEnemy : MonoBehaviour {
        public enum Kind { Gremlin, Charger }
        public Kind kind;
        public SliceGame game;
        public Transform visual;
        public SliceSkeleton Skeleton { get; private set; }
        public bool Dead => health <= 0;
        public float HealthFraction => Mathf.Max(0, health) / (float)maxHealth;
        int health, maxHealth;
        float attackRest, phaseTimer, gait, flash, deathAge, hitLean, biteTime;
        int phase;
        Vector3 chargeDirection, knockback;
        CharacterController motor;
        Renderer[] renderers;
        MaterialPropertyBlock tint;
        LineRenderer warning;
        public void Initialize(SliceGame owner, Kind type) {
            game = owner; kind = type; maxHealth = health = type == Kind.Charger ? 115 : 56;
            motor = GetComponent<CharacterController>(); renderers = visual.GetComponentsInChildren<Renderer>();
            tint = new MaterialPropertyBlock();
            Skeleton=visual.GetComponentInChildren<SliceSkeleton>(); if(Skeleton) Skeleton.Initialize();
            if(kind==Kind.Charger) {
                var go=new GameObject("Charge warning · readable ground chevron"); go.transform.SetParent(transform,false);
                warning=go.AddComponent<LineRenderer>(); warning.useWorldSpace=false; warning.positionCount=5;
                warning.widthMultiplier=.06f; warning.sharedMaterial=SliceWorld.Material(new Color(1,.35f,.1f),true);
                warning.SetPositions(new[]{new Vector3(-.55f,.08f,.7f),new Vector3(-.55f,.08f,2.5f),new Vector3(0,.08f,3.1f),new Vector3(.55f,.08f,2.5f),new Vector3(.55f,.08f,.7f)});
                warning.enabled=false;
            }
        }
        public void Tick(float dt) {
            if(Dead) {
                deathAge+=dt; float p=Mathf.Clamp01(deathAge/.4f);
                visual.localRotation=Quaternion.Euler(0,0,Mathf.SmoothStep(0,85,p));
                visual.localScale=Vector3.one*Mathf.Lerp(1,.05f,p*p);
                visual.localPosition=Vector3.up*Mathf.Sin(p*Mathf.PI)*.2f;
                if(p>=1) gameObject.SetActive(false);
                return;
            }
            if(game.player.Dead) return;
            attackRest -= dt; phaseTimer -= dt; flash = Mathf.Max(0, flash - dt);
            Vector3 delta = game.player.transform.position - transform.position; delta.y = 0;
            Vector3 direction = delta.sqrMagnitude > .001f ? delta.normalized : transform.forward;
            Vector3 movement = Vector3.zero;
            if (kind == Kind.Gremlin) {
                if (delta.magnitude > .85f) movement = direction * 2.1f;
            } else if (phase == 0) {
                movement = direction * 1.4f;
                if (delta.magnitude < 6f) { phase = 1; phaseTimer = .8f; chargeDirection = direction; }
            } else if (phase == 1 && phaseTimer <= 0) { phase = 2; phaseTimer = .48f; }
            else if (phase == 2) {
                movement = chargeDirection * 10;
                if (phaseTimer <= 0) { phase = 3; phaseTimer = 1.15f; }
            } else if (phase == 3 && phaseTimer <= 0) phase = 0;
            Vector3 movementStart=transform.position;
            motor.Move((movement + knockback + Vector3.down * 2) * dt);
            knockback *= Mathf.Exp(-9 * dt);
            var pos = transform.position; pos.y = 0; transform.position = pos;
            transform.rotation = Quaternion.LookRotation(phase == 1 || phase == 2 ? chargeDirection : direction);
            gait += movement.magnitude * dt * 4;
            visual.localPosition = Skeleton?Vector3.zero:Vector3.up * (Mathf.Abs(Mathf.Sin(gait)) * .06f);
            if(Skeleton) {
                Vector3 travel=transform.position-movementStart; travel.y=0;
                float speed=dt>0?travel.magnitude/dt:0;
                Skeleton.Pose(dt,Mathf.Min(2,speed/Skeleton.nominalSpeed),-1,-1,0,travel);
                biteTime=Mathf.Max(0,biteTime-dt);
                Skeleton.CreatureReaction(biteTime>0?Mathf.Sin((1-biteTime/.24f)*Mathf.PI):0,hitLean);
            }
            hitLean=Mathf.MoveTowards(hitLean,0,dt*4);
            visual.localScale=Vector3.Lerp(visual.localScale,phase==1?new Vector3(1.08f,.85f,1.12f):Vector3.one,1-Mathf.Exp(-14*dt));
            visual.localRotation=Quaternion.Slerp(visual.localRotation,Quaternion.Euler(-(Skeleton && kind==Kind.Gremlin?0:hitLean*25)+(phase==2?12:0),0,(Skeleton?0:Mathf.Sin(gait)*3)),1-Mathf.Exp(-18*dt));
            if(Skeleton) Skeleton.GroundFeet(dt,kind==Kind.Charger && phase==2);
            if(warning) warning.enabled=phase==1;
            foreach (var r in renderers) {
                tint.SetColor("_EmissionColor", flash > 0 ? Color.white*.7f : phase == 1 ? new Color(.7f,.17f,.03f)*(1+Mathf.Sin(phaseTimer*16))*.5f : Color.black);
                r.SetPropertyBlock(tint);
            }
            if (delta.magnitude < 1.05f && attackRest <= 0) {
                game.player.Hurt(phase == 2 ? 24 : kind == Kind.Charger ? 16 : 10);
                attackRest = .85f; biteTime=.24f;
            }
        }
        public void TakeHit(int damage, Vector3 direction) {
            if (Dead) return;
            health -= damage; knockback = direction * 5; flash = .1f; hitLean=1;
            SliceEffects.Burst(transform.position, SliceWorld.Cyan);
            game.PlayTone(health <= 0 ? 620 : 450, .08f, .04f);
            if (health <= 0) {
                game.EnemyKilled(this);
                motor.enabled=false; if(warning) warning.enabled=false;
            }
        }
    }
}
