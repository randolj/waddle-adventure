using UnityEngine;

namespace Waddle {
    [CreateAssetMenu(menuName = "Waddle/Slice tuning")]
    public sealed class SliceTuning : ScriptableObject {
        [Header("50 canvas pixels = 1 metre; reference: src/player.js")]
        public float moveSpeed = 5f;
        public float acceleration = 26f;
        public float dashSpeed = 15f;
        public float dashDuration = .16f;
        public float dashRest = .28f;
        public float strikeGrace = .18f;
        public float lungeSpeed = 10.8f;
        public float attackDuration = .30f;
        public float attackCooldown = .36f;
        public float attackRange = 1.85f;
        public float inputBuffer = .13f;
        public float attackArc = 100f;
        public int damage = 28;
        public int maxHealth = 100;
        [Header("Optional Tripo models: +Z forward, Y up, feet at origin")]
        public GameObject drifterModel;
        public GameObject swordModel;
        public GameObject gremlinModel;
        public GameObject chargerModel;
    }
}
