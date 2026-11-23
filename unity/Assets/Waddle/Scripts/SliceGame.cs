using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

namespace Waddle {
    public sealed class SliceGame : MonoBehaviour {
        public enum RunState { Fighting, Cleared, OpeningChest, Carrying, Extracting, Extracted, Lost }
        public static SliceGame Active { get; private set; }
        public SliceTuning tuning;
        public SliceAtmosphere atmosphere;
        public SliceOverworld overworld;
        public GameObject dungeonRoot;
        public List<SliceEnemy> wildernessEnemies = new List<SliceEnemy>();
        List<SliceEnemy> dungeonEnemies;
        public bool InOverworld { get; private set; }
        public bool CacheClaimed { get; private set; }
        public string Conversation { get; private set; }
        float conversationTime;
        public bool InCamp => InOverworld && overworld.IsSafe(player.transform.position);
        public Material effectMaterial;
        public SlicePlayer player;
        public Camera viewCamera;
        public Transform portal;
        public GameObject chest;
        public List<SliceEnemy> enemies = new List<SliceEnemy>();
        public RunState state { get; private set; }
        public int CarriedCoins { get; private set; }
        public int CarriedShards { get; private set; }
        public int BankedCoins { get; private set; }
        public int BankedShards { get; private set; }
        public bool Paused { get; private set; }
        public bool ManualSimulation { get; set; }
        public float RewardNotice { get; private set; }
        public float ExtractionProgress => state==RunState.Extracting?Mathf.Clamp01(extractTime/.8f):0;
        public string BankKey { get; set; } = "waddle_unity_slice_bank_v1";
        public int EnemiesRemaining => enemies.FindAll(e => e && !e.Dead).Count;
        public bool AtChest => chest && Vector3.Distance(player.transform.position,chest.transform.position) < 2;
        public bool AtPortal => portal && Vector3.Distance(player.transform.position,portal.position) < 2;
        public const int RoomCoins = 40, RoomShards = 6;
        float hitStop, shake, extractTime;
        SliceChest chestPresentation;
        Vector3 cameraHome;
        AudioSource audioSource;
        bool queuedAttack, queuedDash, queuedInteract;
        [Serializable] public sealed class BankData { public int coins, shards; public bool cacheClaimed; }
        public void BuildScene() { SliceWorld.Build(this); }
        void Awake() {
            Active=this;
            if (!player) BuildScene();
            chestPresentation=chest.GetComponent<SliceChest>();
            Application.targetFrameRate = 120;
            state = RunState.Fighting; player.Initialize(this);
            dungeonEnemies=new List<SliceEnemy>(enemies);
            foreach (var enemy in enemies) enemy.Initialize(this,enemy.kind);
            foreach (var enemy in wildernessEnemies) enemy.Initialize(this,enemy.kind);
            var args=Environment.GetCommandLineArgs();
            SetArea(Array.IndexOf(args,"--waddle-smoke")<0 && Array.IndexOf(args,"--waddle-capture")<0);
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"--waddle-start-paused")>=0) Paused=true;
            LoadBank(); cameraHome = viewCamera.transform.position;
            audioSource = gameObject.AddComponent<AudioSource>(); audioSource.spatialBlend = 0; audioSource.volume = .6f;
            gameObject.AddComponent<SliceHud>().game = this;
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"--waddle-smoke") >= 0) {
                ManualSimulation = true; gameObject.AddComponent<SliceVerification>().game = this;
            }
            if(Array.IndexOf(Environment.GetCommandLineArgs(),"--waddle-capture") >= 0) gameObject.AddComponent<SliceCapture>().game = this;
        }
        public void LoadBank() {
            BankedCoins=0; BankedShards=0; CacheClaimed=false;
            try {
                var saved=JsonUtility.FromJson<BankData>(PlayerPrefs.GetString(BankKey,"{}"));
                if(saved!=null) { BankedCoins=Mathf.Max(0,saved.coins); BankedShards=Mathf.Max(0,saved.shards); CacheClaimed=saved.cacheClaimed; }
            } catch(ArgumentException) { Debug.LogWarning("Slice bank save was invalid; starting with an empty bank."); }
        }
        void Update() {
            if(ManualSimulation) return;
            var keyboard=Keyboard.current; var mouse=Mouse.current;
            if(keyboard!=null && keyboard.escapeKey.wasPressedThisFrame) TogglePause();
            if(keyboard!=null && keyboard.enterKey.wasPressedThisFrame && (state==RunState.Extracted || state==RunState.Lost)) { Restart(); return; }
            if(Paused) return;
            var move=Vector3.zero;
            if(keyboard!=null) {
                move.x=(keyboard.dKey.isPressed||keyboard.rightArrowKey.isPressed?1:0)-(keyboard.aKey.isPressed||keyboard.leftArrowKey.isPressed?1:0);
                move.z=(keyboard.wKey.isPressed||keyboard.upArrowKey.isPressed?1:0)-(keyboard.sKey.isPressed||keyboard.downArrowKey.isPressed?1:0);
                queuedDash |= keyboard.spaceKey.wasPressedThisFrame || keyboard.leftShiftKey.wasPressedThisFrame;
            }
            Vector3 aim=player.Facing;
            if(mouse!=null) {
                var ray=viewCamera.ScreenPointToRay(mouse.position.ReadValue());
                var plane=new Plane(Vector3.up,Vector3.zero);
                if(plane.Raycast(ray,out float distance)) { aim=ray.GetPoint(distance)-player.transform.position; aim.y=0; }
                queuedAttack |= mouse.leftButton.isPressed;
            }
            queuedInteract |= keyboard!=null && keyboard.eKey.wasPressedThisFrame;
            bool advanced=hitStop<=0;
            Tick(Mathf.Min(Time.deltaTime,.05f),new SliceCommand{move=move.normalized,aim=aim,dash=queuedDash,attack=queuedAttack},queuedInteract);
            if(advanced) { queuedAttack=false; queuedDash=false; queuedInteract=false; }
        }
        // Fixed ticks are also the verification entry point; simulation never depends on RAF or wall time.
        public void Tick(float dt, SliceCommand command, bool interact=false) {
            if(Paused || state==RunState.Lost || state==RunState.Extracted || dt<=0) return;
            conversationTime=Mathf.Max(0,conversationTime-dt); if(conversationTime==0) Conversation=null;
            if(InOverworld) {
                overworld.Tick(dt);
                if(hitStop>0) { hitStop=Mathf.Max(0,hitStop-dt); return; }
                player.Tick(dt,command);
                foreach(var enemy in enemies) if(enemy && enemy.gameObject.activeSelf) {
                    if(enemy.Dead || overworld.CanChase(enemy)) enemy.Tick(dt);
                    else if(enemy.Skeleton) { enemy.Skeleton.Pose(dt,0,-1,-1,0); enemy.Skeleton.GroundFeet(dt); }
                }
                if(InCamp) player.Heal();
                if(interact) Interact();
                return;
            }
            if(atmosphere) atmosphere.Tick(dt);
            RewardNotice=Mathf.Max(0,RewardNotice-dt);
            chestPresentation.Tick(dt);
            if(state==RunState.OpeningChest) {
                if(chestPresentation.IsOpen) {
                    CarriedCoins=RoomCoins; CarriedShards=RoomShards; state=RunState.Carrying; RewardNotice=2.8f;
                    PlayTone(780,.22f,.14f);
                }
                command.attack=false; command.dash=false;
            }
            if(state==RunState.Extracting) {
                extractTime+=dt;
                player.visual.localScale=Vector3.one*Mathf.Lerp(1,.5f,ExtractionProgress);
                player.visual.localPosition=Vector3.up*ExtractionProgress*.8f;
                if(extractTime>=.8f) BankExtraction();
                return;
            }
            if(hitStop>0) { hitStop=Mathf.Max(0,hitStop-dt); return; }
            player.Tick(dt,command);
            foreach(var enemy in enemies) if(enemy && enemy.gameObject.activeSelf && (state==RunState.Fighting || enemy.Dead)) enemy.Tick(dt);
            if(interact) Interact();
        }
        public void Interact() {
            if(Paused || state==RunState.Lost || state==RunState.Extracted) return;
            if(InOverworld) { overworld.Interact(this); return; }
            if(state==RunState.Cleared && AtChest) {
                chestPresentation.Open(); state=RunState.OpeningChest; PlayTone(190,.16f,.1f);
            } else if(state==RunState.Carrying && AtPortal) {
                extractTime=0; state=RunState.Extracting;
                SliceEffects.Ring(portal.position,SliceWorld.Cyan,.7f,.7f); PlayTone(530,.5f,.12f);
            }
        }
        void BankExtraction() {
                BankedCoins+=CarriedCoins; BankedShards+=CarriedShards;
                SaveBank();
                CarriedCoins=0; CarriedShards=0; state=RunState.Extracted; PlayTone(920,.35f,.07f);
        }
        public void EnemyKilled(SliceEnemy enemy) {
            if(!InOverworld && state==RunState.Fighting && EnemiesRemaining==0) {
                state=RunState.Cleared; chestPresentation.Reveal();
                SliceEffects.Ring(chest.transform.position,new Color(1,.6f,.15f),.5f,.7f);
            }
        }
        public void Lose() { CarriedCoins=0; CarriedShards=0; state=RunState.Lost; }
        public void TogglePause() { Paused=!Paused; queuedAttack=false; queuedDash=false; queuedInteract=false; }
        public void Restart() { SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex); }
        void SaveBank() {
            PlayerPrefs.SetString(BankKey,JsonUtility.ToJson(new BankData{coins=BankedCoins,shards=BankedShards,cacheClaimed=CacheClaimed})); PlayerPrefs.Save();
        }
        public void ClaimCache() {
            if(CacheClaimed) return;
            CacheClaimed=true; BankedCoins+=8; BankedShards+=2; SaveBank();
            Say("SUPPLY CACHE · 8 coins + 2 shards secured. Someone left a little luck in the snow.");
            PlayTone(780,.22f,.12f);
        }
        public void Say(string text) { Conversation=text; conversationTime=6; }
        public void EnterFrostvault() {
            if(!InOverworld) return;
            SetArea(false); Say("FROSTVAULT · Clear the chamber, claim the chest, and extract to bring your spoils home.");
        }
        public void SetArea(bool outdoor) {
            InOverworld=outdoor; state=RunState.Fighting;
            enemies=outdoor?wildernessEnemies:dungeonEnemies;
            dungeonRoot.SetActive(!outdoor); overworld.gameObject.SetActive(outdoor);
            foreach(var e in dungeonEnemies) e.gameObject.SetActive(!outdoor);
            foreach(var e in wildernessEnemies) e.gameObject.SetActive(outdoor);
            player.ResetAt(outdoor?SliceOverworld.Origin+new Vector3(-5,0,-12):new Vector3(0,0,-4));
            hitStop=0; shake=0; CarriedCoins=0; CarriedShards=0;
            queuedAttack=false; queuedDash=false; queuedInteract=false;
            RenderSettings.fogColor=outdoor?new Color(.49f,.58f,.72f):new Color(.17f,.21f,.29f);
            RenderSettings.fogDensity=outdoor?.009f:.007f;
            viewCamera.farClipPlane=outdoor?110:80;
            SnapCamera(); Physics.SyncTransforms();
        }
        public void SnapCamera() {
            cameraHome=InOverworld?new Vector3(Mathf.Clamp(player.transform.position.x,SliceOverworld.Origin.x-16,SliceOverworld.Origin.x+16),18,Mathf.Clamp(player.transform.position.z,-17,17)-17):new Vector3(0,16,-16);
            viewCamera.transform.position=cameraHome;
            viewCamera.transform.rotation=InOverworld?Quaternion.Euler(48,0,0):Quaternion.LookRotation(new Vector3(0,0,.7f)-cameraHome);
            viewCamera.orthographicSize=InOverworld?9:Mathf.Max(8.8f,12f/Mathf.Max(.5f,viewCamera.aspect));
        }
        public void Impact(float strength) { shake=Mathf.Max(shake,strength); hitStop=.045f; }
        void LateUpdate() {
            if(!viewCamera || ManualSimulation) return;
            shake=Mathf.MoveTowards(shake,0,Time.unscaledDeltaTime*.8f);
            if(InOverworld && !Paused) {
                var target=new Vector3(Mathf.Clamp(player.transform.position.x,SliceOverworld.Origin.x-16,SliceOverworld.Origin.x+16),18,Mathf.Clamp(player.transform.position.z,-17,17)-17);
                cameraHome=Vector3.Lerp(cameraHome,target,1-Mathf.Exp(-6*Time.deltaTime));
            }
            viewCamera.transform.position=cameraHome+(Paused?Vector3.zero:UnityEngine.Random.insideUnitSphere*shake);
            // Keep the entire room visible at narrow window aspect ratios.
            viewCamera.orthographicSize=InOverworld?Mathf.Max(9,8/Mathf.Max(.5f,viewCamera.aspect)):Mathf.Max(8.8f,12f/Mathf.Max(.5f,viewCamera.aspect));
        }
        public void Slash(Vector3 pos,Vector3 forward,float range,bool lunge) {
            SliceEffects.Slash(pos,forward,range,lunge);
        }
        public void PlayTone(float frequency,float duration,float volume) {
            if(ManualSimulation || !audioSource) return;
            int samples=Mathf.CeilToInt(22050*duration); var data=new float[samples];
            for(int i=0;i<samples;i++) {
                float t=i/22050f, envelope=Mathf.Sin(Mathf.PI*i/samples)*Mathf.Exp(-t*12);
                data[i]=Mathf.Sin(t*frequency*Mathf.PI*2*(1-t*.8f))*envelope;
            }
            var clip=AudioClip.Create("Waddle transient",samples,1,22050,false); clip.SetData(data,0);
            audioSource.PlayOneShot(clip,volume); Destroy(clip,duration+.1f);
        }
    }
}
