<script lang="ts">
  // 12px K-truss (DESIGN.md §4). Only as the header's bottom edge and the certificate frame.
  const id = `truss-${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg class="block w-full text-rule" height="12" aria-hidden="true">
  <defs>
    <pattern {id} width="24" height="12" patternUnits="userSpaceOnUse">
      <path d="M0 0.5H24M0 11.5H24M0 11.5L12 0.5L24 11.5M12 0.5V11.5" stroke="currentColor" stroke-width="1" fill="none" />
    </pattern>
  </defs>
  <rect width="100%" height="12" fill="url(#{id})" />
</svg>
