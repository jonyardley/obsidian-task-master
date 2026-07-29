<script lang="ts">
  import type { TaskMasterController } from '../controller';
  import { rowKey, type Section } from '../model/filter';
  import TaskRow from './TaskRow.svelte';

  const {
    section,
    controller,
    showAllDone,
    filtering,
  }: {
    section: Section;
    controller: TaskMasterController;
    showAllDone: boolean;
    filtering: boolean;
  } = $props();
</script>

<section class="tm-group" class:tm-group-done={section.kind === 'done'}>
  <button
    class="tm-group-header"
    aria-expanded={!section.collapsed}
    onclick={() => void controller.toggleSection(section)}
  >
    <span class="tm-chevron">{section.collapsed ? '▸' : '▾'}</span>
    <span class="tm-group-label">{section.label}</span>
    <span class="tm-group-count">
      {section.count}{#if filtering}<span class="tm-group-total"> of {section.total}</span>{/if}
    </span>
  </button>

  {#if !section.collapsed}
    {#if section.kind === 'done'}
      {#each section.dateGroups ?? [] as dateGroup (dateGroup.label)}
        <h3 class="tm-done-date">{dateGroup.label}</h3>
        <ul class="tm-rows">
          {#each dateGroup.rows as row (rowKey(row))}
            <li><TaskRow {row} {controller} /></li>
          {/each}
        </ul>
      {/each}
      {#if section.hidden > 0}
        <button class="tm-show-all" onclick={() => controller.toggleShowAllDone()}>
          Show all {section.count}
        </button>
      {:else if showAllDone && section.overCap}
        <button class="tm-show-all" onclick={() => controller.toggleShowAllDone()}>
          Show fewer
        </button>
      {/if}
    {:else}
      <ul class="tm-rows">
        {#each section.rows as row (rowKey(row))}
          <li><TaskRow {row} {controller} /></li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
