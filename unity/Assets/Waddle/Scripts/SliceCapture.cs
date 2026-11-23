using System.Collections;
using UnityEngine;

namespace Waddle {
    // Explicit opt-in artifact capture for review. Normal gameplay never runs this.
    public sealed class SliceCapture : MonoBehaviour {
        public SliceGame game;
        IEnumerator Start() {
            game.ManualSimulation=true;
            yield return null;
            if(System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"--waddle-overworld-capture")>=0) {
                yield return OverworldReview(); Application.Quit(0); yield break;
            }
            if(System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"--waddle-ik-capture")>=0) {
                yield return FootReview(); Application.Quit(0); yield break;
            }
            if(System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"--waddle-motion-capture")>=0) {
                yield return MotionReview(); Application.Quit(0); yield break;
            }
            if(System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"--waddle-animation-capture")>=0) {
                yield return AnimationReview(); Application.Quit(0); yield break;
            }
            game.viewCamera.orthographicSize=Mathf.Max(8.8f,12f/game.viewCamera.aspect);
            game.atmosphere.Tick(1.7f);
            if(System.Array.IndexOf(System.Environment.GetCommandLineArgs(),"--waddle-atmosphere-capture")>=0) {
                yield return AtmosphereReview(); Application.Quit(0); yield break;
            }
            game.player.transform.rotation=Quaternion.Euler(0,125,0);
            foreach(var enemy in game.enemies) enemy.Tick(0);
            game.Slash(game.player.transform.position,(Quaternion.Euler(0,125,0)*Vector3.forward),1.6f,false);
            yield return new WaitForEndOfFrame();
            string directory=System.IO.Path.Combine(Application.dataPath,"../../Captures");
            System.IO.Directory.CreateDirectory(directory);
            string path=System.IO.Path.Combine(directory,"frostvault-atmosphere-v4.png");
            var texture=ScreenCapture.CaptureScreenshotAsTexture(); System.IO.File.WriteAllBytes(path,texture.EncodeToPNG()); Destroy(texture);
            Debug.Log("WADDLE_CAPTURE "+System.IO.Path.GetFullPath(path));
            // Capture opening and opened states directly from the simulation, never editing the rendered pixels.
            foreach(var enemy in game.enemies) enemy.TakeHit(10000,Vector3.forward);
            var controller=game.player.GetComponent<CharacterController>(); controller.enabled=false;
            game.player.transform.position=game.chest.transform.position+Vector3.back*1.4f; controller.enabled=true;
            game.Interact();
            for(int i=0;i<18;i++) game.Tick(1f/60,new SliceCommand{aim=Vector3.forward});
            yield return new WaitForEndOfFrame();
            texture=ScreenCapture.CaptureScreenshotAsTexture();
            System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,"frostvault-chest-opening-v4.png"),texture.EncodeToPNG()); Destroy(texture);
            for(int i=0;i<45;i++) game.Tick(1f/60,new SliceCommand{aim=Vector3.forward});
            yield return new WaitForEndOfFrame();
            texture=ScreenCapture.CaptureScreenshotAsTexture();
            System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,"frostvault-chest-open-v4.png"),texture.EncodeToPNG()); Destroy(texture);
            Application.Quit(0);
        }

        IEnumerator OverworldReview() {
            game.SetArea(true);
            string directory=System.IO.Path.Combine(Application.dataPath,"../../Captures"); System.IO.Directory.CreateDirectory(directory);
            var motor=game.player.GetComponent<CharacterController>();
            Vector3[] positions={SliceOverworld.Origin+new Vector3(-5,0,-12),SliceOverworld.Origin+new Vector3(-11,0,3),SliceOverworld.Origin+new Vector3(10,0,13)};
            string[] names={"snowhaven-camp-v7.png","frostwood-pond-v7.png","frostvault-entrance-v7.png"};
            for(int i=0;i<positions.Length;i++) {
                motor.enabled=false; game.player.transform.position=positions[i]; motor.enabled=true; Physics.SyncTransforms();
                for(int tick=0;tick<30;tick++) { game.overworld.Tick(1f/60); game.player.Tick(1f/60,new SliceCommand{aim=Vector3.back}); }
                game.SnapCamera();
                yield return new WaitForEndOfFrame(); var texture=ScreenCapture.CaptureScreenshotAsTexture();
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,names[i]),texture.EncodeToPNG()); Destroy(texture);
            }
            Debug.Log("WADDLE_OVERWORLD_CAPTURE "+System.IO.Path.GetFullPath(directory));
        }

        IEnumerator AtmosphereReview() {
            string directory=System.IO.Path.Combine(Application.dataPath,"../../Captures/atmosphere-frames");
            System.IO.Directory.CreateDirectory(directory);
            game.player.transform.rotation=Quaternion.Euler(0,125,0);
            foreach(var enemy in game.enemies) enemy.Tick(0);
            for(int frame=0;frame<60;frame++) {
                game.atmosphere.Tick(1f/15);
                game.player.Skeleton.Pose(1f/15,0,-1,-1,0);
                if(frame==10 || frame==35) game.Slash(game.player.transform.position,new Vector3(1,0,1).normalized,1.6f,false);
                yield return new WaitForEndOfFrame();
                var texture=ScreenCapture.CaptureScreenshotAsTexture();
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,frame.ToString("D3")+".png"),texture.EncodeToPNG()); Destroy(texture);
            }
            Debug.Log("WADDLE_ATMOSPHERE_CAPTURE "+System.IO.Path.GetFullPath(directory));
        }

        IEnumerator FootReview() {
            string directory=System.IO.Path.Combine(Application.dataPath,"../../Captures/foot-ik-v6-frames"); System.IO.Directory.CreateDirectory(directory);
            foreach(var enemy in game.enemies) enemy.gameObject.SetActive(false);
            var charger=game.enemies[2]; charger.gameObject.SetActive(true);
            var motor=charger.GetComponent<CharacterController>(); motor.enabled=false; charger.transform.position=new Vector3(0,0,4.5f); motor.enabled=true;
            var playerMotor=game.player.GetComponent<CharacterController>(); playerMotor.enabled=false; game.player.transform.position=new Vector3(0,0,-7); playerMotor.enabled=true;
            Physics.SyncTransforms(); game.viewCamera.orthographicSize=3.15f;
            for(int frame=0;frame<90;frame++) {
                if(frame==65) {
                    charger.Skeleton.Pose(0,0,-1,-1,0);
                    var leg=charger.Skeleton.FootIK.legs[0];
                    float side=Mathf.Sign(charger.transform.InverseTransformPoint(leg.foot.position).x);
                    Vector3 p=leg.foot.position+charger.transform.right*side*leg.outward;
                    var slab=SliceWorld.Shape("IK review · tilted flagstone",PrimitiveType.Cube,null,new Vector3(p.x,.055f,p.z),new Vector3(.65f,.08f,.7f),SliceWorld.Material(new Color(.32f,.37f,.4f)),true);
                    slab.transform.rotation=Quaternion.Euler(0,0,8); Physics.SyncTransforms();
                }
                for(int tick=0;tick<3;tick++) {
                    if(frame<65) charger.Tick(1f/60);
                    else { charger.Skeleton.Pose(1f/60,0,-1,-1,0); charger.Skeleton.GroundFeet(1f/60); }
                    game.atmosphere.Tick(1f/60);
                }
                game.viewCamera.transform.position=charger.transform.position+new Vector3(2.8f,5.2f,-6.2f);
                game.viewCamera.transform.LookAt(charger.transform.position+Vector3.up*.7f);
                yield return new WaitForEndOfFrame(); var texture=ScreenCapture.CaptureScreenshotAsTexture();
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,frame.ToString("D3")+".png"),texture.EncodeToPNG()); Destroy(texture);
            }
            charger.Skeleton.FootIK.RestorePose(); yield return new WaitForEndOfFrame();
            var raw=ScreenCapture.CaptureScreenshotAsTexture(); System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,"unadjusted.png"),raw.EncodeToPNG()); Destroy(raw);
            Debug.Log("WADDLE_IK_CAPTURE "+System.IO.Path.GetFullPath(directory));
        }

        IEnumerator MotionReview() {
            string directory=System.IO.Path.Combine(Application.dataPath,"../../Captures/motion-v5-frames"); System.IO.Directory.CreateDirectory(directory);
            foreach(var enemy in game.enemies) enemy.gameObject.SetActive(false);
            var gremlin=game.enemies[0]; gremlin.gameObject.SetActive(true);
            var controller=game.player.GetComponent<CharacterController>(); controller.enabled=false; game.player.transform.position=new Vector3(-3,0,-2); controller.enabled=true;
            var enemyController=gremlin.GetComponent<CharacterController>(); enemyController.enabled=false; gremlin.transform.position=new Vector3(3,0,1); enemyController.enabled=true;
            Physics.SyncTransforms(); game.viewCamera.orthographicSize=3.9f;
            game.viewCamera.transform.position=new Vector3(0,8,-9); game.viewCamera.transform.LookAt(new Vector3(0,.6f,-1.5f));
            for(int frame=0;frame<130;frame++) {
                var aim=gremlin && !gremlin.Dead?gremlin.transform.position-game.player.transform.position:Vector3.back;
                var command=new SliceCommand{aim=aim};
                if(frame<20) { command.move=Vector3.right; command.aim=Vector3.right; }
                if(frame>=85 && frame<101) { command.move=Vector3.left; command.aim=Vector3.left; }
                if(frame==28 || frame==40) command.attack=true;
                if(frame==57) { command.dash=true; command.move=Vector3.left; }
                if(frame==62) command.attack=true;
                if(frame==110) game.player.Hurt(10);
                for(int tick=0;tick<3;tick++) {
                    game.player.Tick(1f/60,command); if(gremlin.gameObject.activeSelf) gremlin.Tick(1f/60); game.atmosphere.Tick(1f/60);
                    command.attack=false; command.dash=false;
                }
                yield return new WaitForEndOfFrame(); var texture=ScreenCapture.CaptureScreenshotAsTexture();
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,frame.ToString("D3")+".png"),texture.EncodeToPNG()); Destroy(texture);
            }
            Debug.Log("WADDLE_MOTION_CAPTURE "+System.IO.Path.GetFullPath(directory));
        }

        IEnumerator AnimationReview() {
            string directory=System.IO.Path.Combine(Application.dataPath,"../../Captures/skeletal-frames");
            System.IO.Directory.CreateDirectory(directory);
            foreach(var enemy in game.enemies) enemy.gameObject.SetActive(false);
            var controller=game.player.GetComponent<CharacterController>(); controller.enabled=false;
            game.player.transform.position=new Vector3(-2,0,-2); controller.enabled=true;
            game.viewCamera.orthographicSize=3.3f;
            game.viewCamera.transform.position=new Vector3(0,7,-9);
            game.viewCamera.transform.LookAt(new Vector3(0,.65f,-2));
            for(int frame=0;frame<100;frame++) {
                var command=new SliceCommand{aim=Vector3.back};
                if(frame<20) { command.move=Vector3.right; command.aim=new Vector3(1,0,-1).normalized; }
                if(frame==30 || frame==42) command.attack=true;
                if(frame==58) { command.dash=true; command.move=Vector3.left; }
                if(frame==63) command.attack=true;
                if(frame==82) game.player.Hurt(10);
                for(int tick=0;tick<3;tick++) { game.player.Tick(1f/60,command); command.attack=false; command.dash=false; }
                yield return new WaitForEndOfFrame();
                var texture=ScreenCapture.CaptureScreenshotAsTexture();
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(directory,frame.ToString("D3")+".png"),texture.EncodeToPNG()); Destroy(texture);
            }
            Debug.Log("WADDLE_ANIMATION_CAPTURE "+System.IO.Path.GetFullPath(directory));
        }
    }
}
