using UnityEngine;

namespace Waddle {
    public sealed class SliceHud : MonoBehaviour {
        public SliceGame game;
        GUIStyle title, small, body, large;
        static readonly Color Ink=new Color(.025f,.045f,.075f,.92f), Paper=new Color(.83f,.9f,.94f), Gold=new Color(1,.71f,.32f);
        void Styles() {
            if(title!=null) return;
            title=new GUIStyle(GUI.skin.label){fontSize=23,fontStyle=FontStyle.Bold}; title.normal.textColor=Paper;
            body=new GUIStyle(title){fontSize=17,fontStyle=FontStyle.Normal};
            small=new GUIStyle(body){fontSize=13}; small.normal.textColor=new Color(.58f,.7f,.8f);
            large=new GUIStyle(title){fontSize=44,alignment=TextAnchor.MiddleCenter};
        }
        void Box(Rect rect,Color color) { var old=GUI.color; GUI.color=color; GUI.DrawTexture(rect,Texture2D.whiteTexture); GUI.color=old; }
        void Label(float x,float y,float w,string text,GUIStyle style) { GUI.Label(new Rect(x,y,w,55),text,style); }
        void OnGUI() {
            if(!game || !game.player) return; Styles();
            float scale=Mathf.Min(Screen.width/1440f,Screen.height/900f); GUI.matrix=Matrix4x4.Scale(Vector3.one*scale);
            float w=Screen.width/scale,h=Screen.height/scale;
            if(game.state==SliceGame.RunState.Lost || game.state==SliceGame.RunState.Extracted || game.Paused) {
                Box(new Rect(0,0,w,h),new Color(.015f,.025f,.045f,.88f));
                bool won=game.state==SliceGame.RunState.Extracted;
                Label(0,h*.32f,w,game.Paused?"A MOMENT IN THE SNOW":won?"SAFELY EXTRACTED":"THE FROST TAKES ITS DUE",large);
                var centered=new GUIStyle(body){alignment=TextAnchor.MiddleCenter};
                Label(0,h*.43f,w,game.Paused?"Press ESC to return":won?"40 coins + 6 shards banked. Your next dive awaits.":game.InOverworld?"The camp will take you in. Your bank is safe.":"This dive's spoils are lost. Your bank is safe.",centered);
                Label(0,h*.5f,w,$"BANK   {game.BankedCoins} coins    /    {game.BankedShards} shards",centered);
                var button=new Rect(w*.5f-140,h*.61f,280,52); Box(button,Gold);
                var buttonStyle=new GUIStyle(body){alignment=TextAnchor.MiddleCenter}; buttonStyle.normal.textColor=Ink;
                if(GUI.Button(button,game.Paused?"RESUME":"RETURN TO CAMP   [ENTER]",buttonStyle)) {
                    if(game.Paused) { /* ESC owns pause state; the game exposes a matching toggle. */ game.TogglePause(); }
                    else game.Restart();
                }
                GUI.matrix=Matrix4x4.identity; return;
            }
            Box(new Rect(28,24,300,104),Ink); Box(new Rect(28,24,3,104),SliceWorld.Cyan);
            Label(46,35,270,"WADDLE'S QUEST",title); Label(46,68,270,game.InOverworld?"SNOWHAVEN  /  FROSTWOOD":"FROSTVAULT  /  FIRST DESCENT",small);
            Label(46,92,270,$"BANK  {game.BankedCoins} coins   ·   {game.BankedShards} shards",small);
            Box(new Rect(w*.5f-220,12,440,62),Ink);
            string objective=game.InOverworld?(game.InCamp?"SNOWHAVEN · SAFE CAMP":"EXPLORE THE FROSTWOOD"):game.state==SliceGame.RunState.Fighting?"CLEAR THE CHAMBER":game.state==SliceGame.RunState.Cleared?"CLAIM YOUR SPOILS":game.state==SliceGame.RunState.OpeningChest?"UNSEALING THE CHEST":game.state==SliceGame.RunState.Extracting?"RETURNING TO SAFETY":"REACH THE EXTRACTION GATE";
            var centeredTitle=new GUIStyle(title){alignment=TextAnchor.MiddleCenter,fontSize=17};
            Label(w*.5f-210,4,420,objective,centeredTitle);
            var centeredSmall=new GUIStyle(small){alignment=TextAnchor.MiddleCenter};
            Label(w*.5f-210,29,420,game.InOverworld?(game.InCamp?"Rest by the hearth · Health restored":"Follow the lantern trail northeast to Frostvault"):game.state==SliceGame.RunState.Fighting?$"{game.EnemiesRemaining} creatures remain":game.state==SliceGame.RunState.Cleared?"The reward chest has appeared":game.state==SliceGame.RunState.OpeningChest?"A little warmth in the frost":"40 coins + 6 shards at risk until you extract",centeredSmall);
            Box(new Rect(28,h-113,300,84),Ink); Label(46,h-104,230,"DRIFTER",body);
            Label(251,h-103,65,$"{game.player.Health}",body);
            Box(new Rect(46,h-73,260,8),new Color(.15f,.18f,.23f));
            Box(new Rect(46,h-73,260*game.player.Health/game.tuning.maxHealth,8),new Color(.65f,.18f,.23f));
            Label(46,h-55,260,game.player.DashReady>=1?"DASH READY":"DASH RECHARGING",small);
            Box(new Rect(46,h-34,260,3),new Color(.12f,.2f,.25f));
            Box(new Rect(46,h-34,260*game.player.DashReady,3),SliceWorld.Cyan);
            Box(new Rect(w-802,h-67,780,63),Ink);
            var controls=new GUIStyle(small){alignment=TextAnchor.MiddleRight};
            Label(w-780,h-62,750,"WASD  move     MOUSE  aim / attack     SPACE  dash     E  interact     ESC  pause",controls);
            Label(w-680,h-40,650,"Hold click to chain swings. Dash, then attack for a lunge.",controls);
            if(game.RewardNotice>0 && !game.InOverworld) {
                Box(new Rect(w*.5f-230,h-215,460,80),Ink);
                Label(w*.5f-225,h-204,450,"+40 COINS     +6 SHARDS",centeredTitle);
                Label(w*.5f-225,h-180,450,"SPOILS ACQUIRED · EXTRACT TO KEEP THEM",centeredSmall);
            }
            if(game.state==SliceGame.RunState.Extracting) {
                Box(new Rect(w*.5f-170,h-150,340,8),Ink);
                Box(new Rect(w*.5f-170,h-150,340*game.ExtractionProgress,8),SliceWorld.Cyan);
            }
            string prompt=game.InOverworld?game.overworld.Prompt(game):null;
            if(game.state==SliceGame.RunState.Cleared && game.AtChest) prompt="[E]  OPEN CHEST · 40 COINS + 6 SHARDS";
            if(game.state==SliceGame.RunState.Carrying && game.AtPortal) prompt="[E]  EXTRACT AND BANK YOUR SPOILS";
            if(prompt!=null) { Box(new Rect(w*.5f-240,h-146,480,46),Ink); Label(w*.5f-235,h-135,470,prompt,centeredTitle); }
            if(game.InOverworld) {
                DrawRegionMap(w);
                if(game.Conversation!=null) {
                    Box(new Rect(w*.5f-350,h-265,700,100),Ink);
                    var dialog=new GUIStyle(body){wordWrap=true,padding=new RectOffset(16,16,14,10)};
                    GUI.Label(new Rect(w*.5f-350,h-265,700,100),game.Conversation,dialog);
                }
            } else if(game.Conversation!=null) {
                Box(new Rect(w*.5f-350,h-265,700,90),Ink);
                var dialog=new GUIStyle(body){wordWrap=true,padding=new RectOffset(16,16,14,10)};
                GUI.Label(new Rect(w*.5f-350,h-265,700,90),game.Conversation,dialog);
            }
            GUI.matrix=Matrix4x4.identity;
            if(game.InOverworld) foreach(var npc in game.overworld.villagers) {
                if(Vector3.Distance(game.player.transform.position,npc.position)>5) continue;
                var point=game.viewCamera.WorldToScreenPoint(npc.position+Vector3.up*1.8f);
                var style=new GUIStyle(small){alignment=TextAnchor.MiddleCenter,fontSize=12}; style.normal.textColor=Paper;
                GUI.Label(new Rect(point.x-80,Screen.height-point.y,160,24),npc.name,style);
            }
            foreach(var e in game.enemies) {
                if(!e || e.Dead || e.HealthFraction>=1) continue;
                var p=game.viewCamera.WorldToScreenPoint(e.transform.position+Vector3.up*1.7f);
                if(p.z<=0) continue;
                Box(new Rect(p.x-24,Screen.height-p.y,48,5),Ink);
                Box(new Rect(p.x-24,Screen.height-p.y,48*e.HealthFraction,5),new Color(.9f,.38f,.3f));
            }
        }
        void DrawRegionMap(float w) {
            var rect=new Rect(w-220,24,192,208); Box(rect,Ink);
            Label(w-208,31,180,"FROSTWOOD     N ↑",small);
            var map=new Rect(w-207,61,166,150); Box(map,new Color(.18f,.26f,.31f));
            // Fixed landmarks and trail give the dots spatial context.
            Box(new Rect(map.x+23,map.y+60,29,22),new Color(.24f,.48f,.61f));
            var route=new[]{new Vector3(-5,0,-10),new Vector3(1,0,-5),new Vector3(7,0,5),new Vector3(11,0,16)};
            for(int i=0;i<route.Length-1;i++) for(int n=0;n<14;n++) MapDot(map,Vector3.Lerp(route[i],route[i+1],n/14f),new Color(.45f,.5f,.49f),2);
            MapDot(map,SliceOverworld.Camp,Gold,9);
            MapDot(map,game.overworld.entrance.position-SliceOverworld.Origin,SliceWorld.Cyan,9);
            if(!game.CacheClaimed) MapDot(map,game.overworld.cache.position-SliceOverworld.Origin,new Color(.6f,.85f,.86f),6);
            MapDot(map,game.player.transform.position-SliceOverworld.Origin,Color.white,6);
            Label(w-208,213,188,"● camp    ◆ vault    · cache",small);
        }
        void MapDot(Rect map,Vector3 p,Color c,float size) {
            Box(new Rect(map.x+(p.x+26)/52*map.width-size*.5f,map.y+(26-p.z)/52*map.height-size*.5f,size,size),c);
        }
    }
}
