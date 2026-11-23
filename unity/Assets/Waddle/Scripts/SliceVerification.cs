using System;
using System.Collections;
using UnityEngine;

namespace Waddle {
    // Run the built player with --waddle-smoke. Assertions drive fixed simulation ticks.
    public sealed class SliceVerification : MonoBehaviour {
        public SliceGame game;
        int checks;
        string temporaryKey;
        void Check(bool ok,string description) {
            if(!ok) throw new Exception("WADDLE_FAIL: "+description);
            checks++; Debug.Log("WADDLE_CHECK: "+description);
        }
        void Teleport(Vector3 p) {
            var controller=game.player.GetComponent<CharacterController>(); controller.enabled=false; game.player.transform.position=p; controller.enabled=true; Physics.SyncTransforms();
        }
        void StepPlayer(int ticks,SliceCommand command) { for(int i=0;i<ticks;i++) game.player.Tick(1f/60,command); }
        IEnumerator Start() {
            yield return null;
            try { Run(); Debug.Log("WADDLE_SMOKE_OK "+checks+" assertions"); Cleanup(); Application.Quit(0); }
            catch(Exception e) { Debug.LogException(e); Cleanup(); Application.Quit(1); }
        }
        void Cleanup() { if(!string.IsNullOrEmpty(temporaryKey)) { PlayerPrefs.DeleteKey(temporaryKey); PlayerPrefs.Save(); } }
        void Run() {
            temporaryKey="waddle_slice_smoke_"+Guid.NewGuid().ToString("N"); game.BankKey=temporaryKey; game.LoadBank();
            game.SetArea(true);
            Check(game.InCamp && !game.dungeonRoot.activeSelf,"normal entry area is a safe camp with the dungeon disabled");
            Teleport(game.overworld.entrance.position+Vector3.back*1.5f); game.Interact();
            Check(!game.InOverworld && game.player.Health==game.tuning.maxHealth && game.EnemiesRemaining==3,"a fresh camp-to-vault trip starts a full-health fight against the three original enemies");
            Check(game.enemies.Count==3 && game.EnemiesRemaining==3,"two gremlins and one charger initialized");
            var skeleton=game.player.Skeleton;
            Check(skeleton && skeleton.Ready && skeleton.HasCombatClips,"Waddle has a live skeletal graph with locomotion, sword, dash and hurt clips");
            var skin=skeleton.GetComponentInChildren<SkinnedMeshRenderer>();
            Check(skin && skin.bones.Length>=60 && skin.sharedMesh.boneWeights.Length==skin.sharedMesh.vertexCount,"Waddle renders a weighted mesh driven by the imported skeleton");
            Check(game.player.weaponPivot.parent==skeleton.rightHand,"sword is attached to the animated right-hand socket");
            var leftFoot=Array.Find(skeleton.GetComponentsInChildren<Transform>(),t=>t.name.EndsWith("LeftFoot"));
            Quaternion idleFoot=leftFoot.localRotation;
            Quaternion idleHand=skeleton.rightHand.rotation;
            skeleton.Pose(0,0,.42f,-1,0);
            Check(Quaternion.Angle(idleHand,skeleton.rightHand.rotation)>8,"sword action layer rotates the hand bone through the upper-body mask");
            Check(Quaternion.Angle(idleFoot,leftFoot.localRotation)<.1f,"upper-body sword layer preserves the locomotion pose of the feet");
            skeleton.Pose(0,0,-1,-1,0);
            var meshA=new Mesh(); var meshB=new Mesh(); skin.BakeMesh(meshA,true);
            float bottom=float.PositiveInfinity,top=float.NegativeInfinity;
            foreach(var vertex in meshA.vertices) { float y=skin.transform.TransformPoint(vertex).y; bottom=Mathf.Min(bottom,y); top=Mathf.Max(top,y); }
            Check(top-bottom>1.1f && top-bottom<2.0f,"evaluated skinned Waddle retains the intended character scale ("+(top-bottom).ToString("F2")+"m)");
            StepPlayer(12,new SliceCommand{move=Vector3.forward,aim=Vector3.forward}); skin.BakeMesh(meshB,true);
            float deformation=0; var verticesA=meshA.vertices; var verticesB=meshB.vertices;
            for(int i=0;i<verticesA.Length;i++) deformation=Mathf.Max(deformation,skin.transform.TransformVector(verticesA[i]-verticesB[i]).magnitude);
            Check(deformation>.015f,"walking deforms the skinned mesh rather than moving a static model");
            Destroy(meshA); Destroy(meshB);
            Check(game.enemies[2].Skeleton && game.enemies[2].Skeleton.Ready,"charger has a live quadruped skeletal walk cycle");
            foreach(var enemy in game.enemies) if(enemy.kind==SliceEnemy.Kind.Gremlin) {
                var rig=enemy.Skeleton;
                Check(rig && rig.Ready && rig.creatureHead && rig.torso,"gremlin has a live weighted rig with head/spine reaction bones");
            }
            var gremlinRig=game.enemies[0].Skeleton; var gremlinSkin=gremlinRig.GetComponentInChildren<SkinnedMeshRenderer>();
            var gremlinA=new Mesh(); var gremlinB=new Mesh(); gremlinSkin.BakeMesh(gremlinA,true);
            gremlinRig.Pose(.18f,1,-1,-1,0,Vector3.forward); gremlinSkin.BakeMesh(gremlinB,true);
            float gremlinDeformation=0; var ga=gremlinA.vertices; var gb=gremlinB.vertices;
            for(int i=0;i<ga.Length;i++) gremlinDeformation=Mathf.Max(gremlinDeformation,gremlinSkin.transform.TransformVector(ga[i]-gb[i]).magnitude);
            Check(gremlinSkin.bones.Length>20 && gremlinDeformation>.01f,"gremlin walk genuinely deforms the skinned body");
            Quaternion neutralHead=gremlinRig.creatureHead.rotation; gremlinRig.CreatureReaction(1,0);
            Check(Quaternion.Angle(neutralHead,gremlinRig.creatureHead.rotation)>12,"gremlin bite animates its head bones");
            gremlinRig.Pose(0,0,-1,-1,0); Quaternion neutralSpine=gremlinRig.torso.rotation; neutralHead=gremlinRig.creatureHead.rotation;
            for(int i=0;i<30;i++) { gremlinRig.Pose(1f/60,0,-1,-1,0); gremlinRig.CreatureReaction(1,0); }
            Check(Quaternion.Angle(neutralSpine,gremlinRig.torso.rotation)<8 && Quaternion.Angle(neutralHead,gremlinRig.creatureHead.rotation)<25,"gremlin reaction offsets stay bounded across repeated ticks");
            gremlinRig.Pose(0,0,-1,-1,0); Destroy(gremlinA); Destroy(gremlinB);
            skeleton.Pose(0,0,.5f,-1,0); skeleton.Pose(1f/60,0,-1,-1,0);
            Check(skeleton.ActionBlend>0 && skeleton.ActionBlend<1,"sword recovery blends out instead of cutting to idle");
            for(int i=0;i<8;i++) skeleton.Pose(1f/60,0,-1,-1,0);
            Check(skeleton.ActionBlend==0,"sword recovery settles fully into locomotion");
            skeleton.Pose(0,0,-1,.5f,0); skeleton.Pose(1f/60,0,.1f,-1,0);
            Check(skeleton.DashBlend>0 && skeleton.DashBlend<1 && skeleton.ActionBlend>0,"dash-strike overlaps dash recovery with the sword pose");
            skeleton.Pose(0,0,-1,-1,0);
            VerifyFeet();
            Teleport(game.portal.position); game.Interact();
            Check(game.state==SliceGame.RunState.Fighting && !PlayerPrefs.HasKey(temporaryKey),"exit locked and no save written during combat");
            Teleport(new Vector3(0,0,-5)); var start=game.player.transform.position;
            StepPlayer(60,new SliceCommand{move=Vector3.forward,aim=Vector3.forward});
            float straight=(game.player.transform.position-start).magnitude;
            Check(straight>4.6f && straight<5.1f,"one second of movement matches reference speed");
            Teleport(new Vector3(0,0,-5)); start=game.player.transform.position;
            StepPlayer(60,new SliceCommand{move=new Vector3(1,0,1).normalized,aim=Vector3.forward});
            Check(Mathf.Abs((game.player.transform.position-start).magnitude-straight)<.15f,"diagonal movement is normalized");
            StepPlayer(60,new SliceCommand()); Teleport(new Vector3(0,0,-4)); start=game.player.transform.position;
            game.player.Tick(1f/60,new SliceCommand{move=Vector3.right,aim=Vector3.right,dash=true});
            int hp=game.player.Health; game.player.Hurt(50);
            Check(game.player.Health==hp,"dash grants invulnerability");
            StepPlayer(9,new SliceCommand{aim=Vector3.right});
            Check((game.player.transform.position-start).magnitude>2.2f && (game.player.transform.position-start).magnitude<2.7f,"dash travels about 2.4m over the longer readable dash animation");
            game.player.Tick(1f/60,new SliceCommand{aim=Vector3.forward,attack=true});
            Check(game.player.LastAttackWasLunge && Vector3.Dot(game.player.Facing,Vector3.right)>.99f,"dash-strike locks launch heading despite cursor change");
            StepPlayer(90,new SliceCommand());
            float idlePhase=skeleton.GaitPhase; StepPlayer(30,new SliceCommand());
            Check(skeleton.GaitPhase==idlePhase && skeleton.LocomotionBlend==0,"idle stops the gait phase and settles the feet");
            Quaternion priorHeading=game.player.visual.rotation; Vector3 turnAim=-game.player.Facing;
            game.player.Tick(1f/60,new SliceCommand{aim=turnAim});
            Check(Quaternion.Angle(priorHeading,game.player.visual.rotation)<=18.1f && Vector3.Dot(game.player.Facing,turnAim)>.99f,"visual turns ease while combat facing responds immediately");
            StepPlayer(30,new SliceCommand{aim=turnAim});
            Check(Quaternion.Angle(game.player.visual.rotation,game.player.transform.rotation)<.1f,"visual heading catches up to combat aim");
            Teleport(new Vector3(7,0,-1));
            StepPlayer(120,new SliceCommand{move=Vector3.right,aim=Vector3.right});
            Check(game.player.transform.position.x<10.1f,"outer wall blocks walking");
            float wallPhase=skeleton.GaitPhase; StepPlayer(30,new SliceCommand{move=Vector3.right,aim=Vector3.right});
            Check(skeleton.GaitPhase==wallPhase && skeleton.LocomotionBlend<.01f,"cover collision stops the gait rather than making feet run in place");
            StepPlayer(30,new SliceCommand()); Teleport(new Vector3(-5,0,-1));
            StepPlayer(60,new SliceCommand{move=Vector3.forward,aim=Vector3.forward});
            Check(game.player.transform.position.z<.7f,"cover pillar blocks walking");
            // Isolate a front/back pair without relying on real frames or AI randomness.
            StepPlayer(60,new SliceCommand()); Teleport(new Vector3(0,0,-3));
            MoveEnemy(game.enemies[0],new Vector3(0,0,-1.7f)); MoveEnemy(game.enemies[1],new Vector3(0,0,-4.3f));
            float before=game.enemies[0].HealthFraction;
            game.player.Tick(1f/60,new SliceCommand{aim=Vector3.forward,attack=true});
            StepPlayer(6,new SliceCommand{aim=Vector3.back});
            Check(game.enemies[0].HealthFraction==before && Vector3.Dot(game.player.Facing,Vector3.forward)>.99f,"sword wind-up delays damage and preserves the committed swing direction");
            StepPlayer(6,new SliceCommand{aim=Vector3.forward});
            Check(game.enemies[0].HealthFraction<before && game.enemies[1].HealthFraction==1,"sword cone damages front enemy and excludes enemy behind");
            Check(Mathf.Abs(game.enemies[0].HealthFraction-.5f)<.001f,"a swing resolves damage once");
            StepPlayer(3,new SliceCommand{aim=Vector3.forward});
            game.player.Tick(1f/60,new SliceCommand{aim=Vector3.forward,attack=true});
            StepPlayer(20,new SliceCommand{aim=Vector3.forward});
            Check(game.enemies[0].Dead,"a press near recovery end buffers the next swing without requiring another click");
            int oldHp=game.player.Health; game.player.Hurt(10); game.player.Hurt(10);
            Check(game.player.Health==oldHp-10,"contact damage respects recovery invulnerability");
            game.TogglePause(); Vector3 paused=game.player.transform.position; float pausedClock=skeleton.Clock, pausedAtmosphere=game.atmosphere.Clock; Quaternion pausedHand=skeleton.rightHand.localRotation; Vector3 pausedFoot=skeleton.FootIK.legs[0].foot.position; game.Tick(1,new SliceCommand{move=Vector3.right});
            Check(game.player.transform.position==paused && skeleton.Clock==pausedClock && game.atmosphere.Clock==pausedAtmosphere && skeleton.rightHand.localRotation==pausedHand && skeleton.FootIK.legs[0].foot.position==pausedFoot,"pause freezes movement, skeletal animation, foot IK and atmosphere"); game.TogglePause();
            foreach(var e in game.enemies) e.TakeHit(10000,Vector3.forward);
            Check(game.state==SliceGame.RunState.Cleared && game.chest.activeSelf && game.CarriedCoins==0,"room clear reveals chest without banking or granting per-kill loot");
            Teleport(game.chest.transform.position); game.Interact(); game.Interact();
            Check(game.state==SliceGame.RunState.OpeningChest && game.CarriedCoins==0,"chest animates before granting its reward");
            game.TogglePause(); for(int i=0;i<60;i++) game.Tick(1f/60,new SliceCommand());
            Check(game.state==SliceGame.RunState.OpeningChest && game.CarriedCoins==0,"pause freezes chest animation and reward timing"); game.TogglePause();
            for(int i=0;i<50;i++) game.Tick(1f/60,new SliceCommand());
            Check(game.state==SliceGame.RunState.Carrying && game.CarriedCoins==40 && game.CarriedShards==6 && game.chest.activeSelf && game.chest.GetComponent<SliceChest>().IsOpen,"chest remains open and grants reward once after animation");
            var lid=game.chest.GetComponent<SliceChest>().lid;
            Check(lid.TransformPoint(new Vector3(0,.11f,-.43f)).y>lid.position.y+.2f,"chest lid lifts above the box instead of rotating into it");
            Check(!PlayerPrefs.HasKey(temporaryKey),"unextracted rewards remain unsaved");
            Teleport(game.portal.position); game.Interact(); game.Interact();
            Check(game.state==SliceGame.RunState.Extracting && !PlayerPrefs.HasKey(temporaryKey),"extraction channel starts without prematurely saving loot");
            game.TogglePause(); game.Tick(1,new SliceCommand());
            Check(game.ExtractionProgress==0 && !PlayerPrefs.HasKey(temporaryKey),"pause freezes extraction channel and banking"); game.TogglePause();
            for(int i=0;i<60;i++) game.Tick(1f/60,new SliceCommand());
            Check(game.state==SliceGame.RunState.Extracted && game.BankedCoins==40 && game.BankedShards==6 && game.CarriedCoins==0,"extract banks the room reward exactly once");
            var saved=JsonUtility.FromJson<SliceGame.BankData>(PlayerPrefs.GetString(temporaryKey));
            Check(saved.coins==40 && saved.shards==6,"bank survives serialized persistence round trip");
            game.Lose();
            Check(game.CarriedCoins==0 && game.BankedCoins==40 && game.BankedShards==6,"loss forfeits carried loot and preserves bank");
            VerifyOverworld();
        }
        void VerifyOverworld() {
            game.SetArea(true);
            Check(game.InOverworld && game.InCamp && game.player.Health==game.tuning.maxHealth,"return to Snowhaven resets player health and places Waddle in the safe camp");
            Check(!game.dungeonRoot.activeSelf && game.overworld.gameObject.activeSelf && game.enemies==game.wildernessEnemies,"outdoor region swaps collision, lights and the active combat roster");
            int health=game.player.Health; game.player.Hurt(20);
            Check(game.player.Health==health,"camp safety blocks hostile damage");
            Teleport(SliceOverworld.Origin+new Vector3(0,0,1));
            for(int i=0;i<45;i++) game.Tick(1f/60,new SliceCommand());
            game.player.Hurt(10); Check(game.player.Health==health-10,"wilderness retains normal combat damage");
            Teleport(SliceOverworld.Origin+SliceOverworld.Camp+Vector3.back*1.5f);
            game.Tick(1f/60,new SliceCommand()); game.Tick(1f/60,new SliceCommand()); game.Tick(1f/60,new SliceCommand()); game.Tick(1f/60,new SliceCommand());
            Check(game.player.Health==health,"returning to camp restores health");
            var enemy=game.enemies[0]; game.overworld.CanChase(enemy); MoveEnemy(enemy,game.player.transform.position+Vector3.forward);
            Check(!game.overworld.CanChase(enemy) && !game.overworld.IsSafe(enemy.transform.position),"hostiles led to camp are sent back to their wilderness post");
            var start=game.player.transform.position; float clock=game.overworld.Clock;
            game.TogglePause(); game.Tick(1,new SliceCommand{move=Vector3.right});
            Check(game.player.transform.position==start && game.overworld.Clock==clock,"pause freezes outdoor movement, fire, snow and NPC clocks"); game.TogglePause();
            Teleport(game.overworld.villagers[0].position+Vector3.back*1.3f); game.Interact();
            Check(game.Conversation!=null && game.Conversation.Contains("PIP"),"nearby NPC interaction provides wilderness directions");
            Teleport(game.overworld.cache.position+Vector3.back*1.3f); game.Interact(); game.Interact();
            Check(game.CacheClaimed && game.BankedCoins==48 && game.BankedShards==8 && game.CarriedCoins==0,"supply cache banks its reward exactly once outside a dive");
            game.LoadBank();
            Check(game.CacheClaimed && game.BankedCoins==48 && game.BankedShards==8,"cache claim and bank totals survive reload together");
            foreach(var e in game.enemies) e.TakeHit(10000,Vector3.forward);
            Check(game.state==SliceGame.RunState.Fighting && !game.chest.activeInHierarchy,"clearing wilderness creatures never reveals the dungeon chest");
            Teleport(SliceOverworld.Origin+new Vector3(23,0,-18)); StepPlayer(120,new SliceCommand{move=Vector3.right,aim=Vector3.right});
            Check(game.player.transform.position.x<SliceOverworld.Origin.x+25.6f,"outer region collision keeps Waddle on the snowfield");
            Teleport(game.overworld.entrance.position+Vector3.back*1.5f); game.Interact();
            Check(!game.InOverworld && game.dungeonRoot.activeSelf && !game.overworld.gameObject.activeSelf && game.player.transform.position.z==-4,"entrance interaction transfers Waddle into Frostvault with outdoor objects disabled");
            Check(game.BankedCoins==48 && game.BankedShards==8 && game.CarriedCoins==0,"entering a dive preserves secured outdoor rewards");
        }
        void VerifyFeet() {
            foreach(var actor in new[]{game.player.Skeleton,game.enemies[0].Skeleton,game.enemies[2].Skeleton}) {
                Check(actor.FootIK && actor.FootIK.Ready,"foot IK chains are bound for "+actor.name);
                actor.Pose(0,0,-1,-1,0); actor.GroundFeet(0);
                Check(actor.FootIK.GroundHits==actor.FootIK.legs.Length,"ground probes find solid floor below every supporting foot of "+actor.name);
            }
            var charger=game.enemies[2].Skeleton; var ik=charger.FootIK;
            charger.Pose(0,0,-1,-1,0);
            float before=Mathf.Abs(charger.transform.InverseTransformPoint(ik.legs[0].foot.position).x)+Mathf.Abs(charger.transform.InverseTransformPoint(ik.legs[1].foot.position).x);
            charger.GroundFeet(0);
            float after=Mathf.Abs(charger.transform.InverseTransformPoint(ik.legs[0].foot.position).x)+Mathf.Abs(charger.transform.InverseTransformPoint(ik.legs[1].foot.position).x);
            Check(after-before>.14f,"charger forefeet settle into a visibly wider stance");
            Vector3 actorPosition=game.enemies[2].transform.position, planted=ik.legs[0].foot.position;
            game.enemies[2].transform.position+=Vector3.right*.015f;
            charger.Pose(0,0,-1,-1,0); charger.GroundFeet(0);
            Check(Vector3.Distance(planted,ik.legs[0].foot.position)<.005f,"a reachable planted paw stays in world space through a small body shift");
            game.enemies[2].transform.position=actorPosition; Physics.SyncTransforms();
            charger.Pose(0,0,-1,-1,0); var leg=ik.legs[0];
            float side=Mathf.Sign(charger.transform.InverseTransformPoint(leg.foot.position).x);
            Vector3 point=leg.foot.position+game.enemies[2].transform.right*side*leg.outward;
            var slab=GameObject.CreatePrimitive(PrimitiveType.Cube); slab.name="Temporary IK slope verification"; slab.layer=6;
            slab.transform.position=new Vector3(point.x,.055f,point.z); slab.transform.localScale=new Vector3(.65f,.08f,.7f); slab.transform.rotation=Quaternion.Euler(0,0,8);
            Physics.SyncTransforms(); Quaternion originalFoot=leg.foot.rotation; charger.GroundFeet(0);
            Check(leg.Hit && Mathf.Abs(leg.Normal.x)>.1f && leg.Normal.y>.95f,"foot probe reads the raised sloped surface and its normal");
            Check(leg.Error<.015f,"analytic leg solver reaches the sloped foot target without moving the actor");
            Check(Quaternion.Angle(leg.foot.rotation,Quaternion.FromToRotation(Vector3.up,leg.Normal)*originalFoot)<.1f,"paw orientation follows the ground normal");
            slab.GetComponent<Collider>().enabled=false; Destroy(slab); Physics.SyncTransforms();
            for(int i=0;i<10;i++) { charger.Pose(1f/60,0,-1,.5f,0); charger.GroundFeet(1f/60,true); }
            // Creature rigs have no dive clip: airborne suppression is still explicit during their charge.
            Check(ik.Weight<.01f && Array.TrueForAll(ik.legs,l=>!l.Planted),"airborne or charging movement releases planted foot anchors");
            charger.Pose(0,0,-1,-1,0); charger.GroundFeet(0);
            var root=new GameObject("Temporary analytic IK verification"); var upper=new GameObject("upper").transform; var lower=new GameObject("lower").transform; var foot=new GameObject("foot").transform;
            upper.SetParent(root.transform); lower.SetParent(upper); foot.SetParent(lower);
            upper.position=new Vector3(20,1,0); lower.position=new Vector3(20,.55f,.28f); foot.position=new Vector3(20,.12f,.02f);
            float a=Vector3.Distance(upper.position,lower.position),b=Vector3.Distance(lower.position,foot.position);
            Vector3 target=new Vector3(20.12f,.18f,.15f); SliceFootIK.SolveTwoBone(upper,lower,foot,target,Quaternion.identity);
            Check(Vector3.Distance(foot.position,target)<.001f && Mathf.Abs(Vector3.Distance(upper.position,lower.position)-a)<.0001f && Mathf.Abs(Vector3.Distance(lower.position,foot.position)-b)<.0001f,"two-bone solve reaches a reachable target while preserving bone lengths");
            SliceFootIK.SolveTwoBone(upper,lower,foot,new Vector3(30,20,0),Quaternion.identity);
            Check(Vector3.Distance(upper.position,foot.position)<=a+b+.001f && !float.IsNaN(foot.position.x),"unreachable IK targets clamp safely without stretching or NaN"); Destroy(root);
        }
        void MoveEnemy(SliceEnemy enemy,Vector3 position) {
            var controller=enemy.GetComponent<CharacterController>(); controller.enabled=false; enemy.transform.position=position; controller.enabled=true; Physics.SyncTransforms();
        }
    }
}
