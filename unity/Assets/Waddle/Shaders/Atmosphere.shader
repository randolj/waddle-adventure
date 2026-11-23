Shader "Waddle/Soft atmosphere" {
    Properties {
        [MainColor][HDR] _BaseColor("Tint", Color) = (1,1,1,1)
        _DstBlend("Destination blend", Float) = 1
        _Portal("Portal surface", Float) = 0
        _Phase("Simulation time", Float) = 0
    }
    SubShader {
        Tags { "RenderPipeline"="UniversalPipeline" "Queue"="Transparent" "RenderType"="Transparent" }
        Pass {
            Blend SrcAlpha [_DstBlend]
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes { float4 positionOS:POSITION; float2 uv:TEXCOORD0; float4 color:COLOR; };
            struct Varyings { float4 positionCS:SV_POSITION; float2 uv:TEXCOORD0; float4 color:COLOR; };
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
                float _DstBlend, _Portal, _Phase;
            CBUFFER_END
            Varyings vert(Attributes v) {
                Varyings o; o.positionCS=TransformObjectToHClip(v.positionOS.xyz); o.uv=v.uv; o.color=v.color; return o;
            }
            half4 frag(Varyings i):SV_Target {
                float2 p=i.uv*2-1;
                float soft=pow(saturate(1-dot(p,p)),2);
                float light=1;
                if(_Portal>.5) {
                    float rim=pow(saturate(abs(p.x)),5);
                    float wave=sin(i.uv.x*55+sin(i.uv.y*25-_Phase)*2+_Phase*1.7)*.5+.5;
                    float threads=pow(wave,24)*(.25+.75*i.uv.y);
                    soft=smoothstep(0,.08,i.uv.y)*smoothstep(1,.9,i.uv.y)*(.14+rim*.55+threads*.12);
                    light=.6+threads*.5+rim;
                }
                return half4(_BaseColor.rgb*i.color.rgb*light,_BaseColor.a*i.color.a*soft);
            }
            ENDHLSL
        }
    }
}
