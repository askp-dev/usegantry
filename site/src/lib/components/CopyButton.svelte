<script lang="ts">
  let { text, label = "Copy" }: { text: string; label?: string } = $props();
  let done = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      done = true;
      setTimeout(() => (done = false), 1600);
    } catch {
      done = false;
    }
  }
</script>

<button type="button" onclick={copy} class="label h-7 shrink-0 border border-ink px-2.5 text-[10px] text-ink transition-colors duration-[120ms] hover:bg-ink hover:text-paper" aria-live="polite">
  {done ? "Copied" : label}
</button>
