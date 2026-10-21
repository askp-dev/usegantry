<script lang="ts">
  // The tower (DESIGN.md §4): two members, K-bracing, one service arm. No rocket: the tower is the product.
  let { size = 24, title = "Gantry" }: { size?: number; title?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" role="img" aria-label={title}>
  <path d="M6 3v18M13 3v18M3 21h13" />
  <path d="M6 7l7 3-7 3 7 3-7 3" stroke-width="1.5" />
  <path d="M13 9h8v3" />
  <path d="M5 3h9" />
</svg>
