<script lang="ts">
  import { untrack } from 'svelte';
  import type { TaskMasterController } from '../controller';
  import GroupSection from './GroupSection.svelte';

  const { controller }: { controller: TaskMasterController } = $props();

  // untrack because the controller is passed once, at mount, and never swapped.
  let snapshot = $state(untrack(() => controller.snapshot()));

  $effect(() => controller.subscribe(() => (snapshot = controller.snapshot())));
</script>

<div class="tm-root">
  <div class="tm-header">
    <span class="tm-totals">{snapshot.openCount} open, {snapshot.doneCount} done</span>
    {#if !snapshot.ready}
      <span class="tm-indexing">indexing…</span>
    {/if}
  </div>

  {#if snapshot.ready && snapshot.openCount === 0 && snapshot.doneCount === 0}
    <p class="tm-empty">
      No tasks found. Task Master reads every checkbox line in the vault, apart from the
      folders listed in its excluded paths.
    </p>
  {:else}
    {#each snapshot.sections as section (section.id)}
      <GroupSection {section} {controller} showAllDone={snapshot.showAllDone} />
    {/each}
  {/if}
</div>
