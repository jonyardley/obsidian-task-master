<script lang="ts">
  import { untrack } from 'svelte';
  import type { TaskMasterController } from '../controller';
  import GroupSection from './GroupSection.svelte';
  import Toolbar from './Toolbar.svelte';

  const { controller }: { controller: TaskMasterController } = $props();

  // untrack because the controller is passed once, at mount, and never swapped.
  let snapshot = $state(untrack(() => controller.snapshot()));

  $effect(() => controller.subscribe(() => (snapshot = controller.snapshot())));

  const empty = $derived(snapshot.totalOpenCount === 0 && snapshot.totalDoneCount === 0);
  const noMatches = $derived(!empty && snapshot.openCount === 0 && snapshot.doneCount === 0);
</script>

<div class="tm-root">
  <Toolbar {snapshot} {controller} />

  <div class="tm-header">
    <span class="tm-totals">
      {#if snapshot.filtering}
        {snapshot.openCount} of {snapshot.totalOpenCount} open, {snapshot.doneCount} of {snapshot.totalDoneCount}
        done
      {:else}
        {snapshot.openCount} open, {snapshot.doneCount} done
      {/if}
    </span>
    {#if !snapshot.ready}
      <span class="tm-indexing">indexing…</span>
    {/if}
  </div>

  {#if snapshot.ready && empty}
    <p class="tm-empty">
      No tasks found. Task Master reads every checkbox line in the vault, apart from the
      folders listed in its excluded paths.
    </p>
  {:else}
    {#if snapshot.ready && noMatches}
      <p class="tm-empty">
        Nothing matches this filter. The sections below still show the shape of the whole.
      </p>
    {/if}
    {#each snapshot.sections as section (section.id)}
      <GroupSection
        {section}
        {controller}
        showAllDone={snapshot.showAllDone}
        filtering={snapshot.filtering}
      />
    {/each}
  {/if}
</div>
