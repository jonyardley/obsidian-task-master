<script lang="ts">
  import { debounce } from 'obsidian';
  import { untrack } from 'svelte';
  import type { TaskMasterController, ViewSnapshot } from '../controller';
  import type { TagMode } from '../model/query';
  import type { Settings } from '../model/types';

  const {
    snapshot,
    controller,
  }: { snapshot: ViewSnapshot; controller: TaskMasterController } = $props();

  const SORTS: [value: Settings['fallbackSort'], label: string][] = [
    ['priority', 'priority'],
    ['due', 'due date'],
    ['file', 'file order'],
  ];
  const MODES: readonly TagMode[] = ['any', 'all'];

  // untrack because these take the search term as it stands at mount, and follow it
  // from then on through the effect below.
  let search = $state(untrack(() => snapshot.filter.search));
  let tagsOpen = $state(false);
  let tagSelect: HTMLDivElement | undefined = $state();
  /** The last value handed to the controller, so an external reset is distinguishable. */
  let pushed = $state(untrack(() => snapshot.filter.search));

  // 120 ms per DESIGN.md section 6.4. The third argument resets the timer on each
  // keystroke, so it fires once typing stops rather than 120 ms after it started.
  const pushSearch = debounce(
    (text: string) => {
      pushed = text;
      controller.setSearch(text);
    },
    120,
    true,
  );

  $effect(() => () => pushSearch.cancel());

  // Follows the filter when something other than this input changes it. Comparing
  // against `pushed` rather than against `search` is what stops an unrelated
  // snapshot, mid-debounce, from wiping half-typed text.
  $effect(() => {
    if (snapshot.filter.search !== pushed) {
      pushed = snapshot.filter.search;
      search = snapshot.filter.search;
    }
  });

  function onSearch(event: Event & { currentTarget: HTMLInputElement }): void {
    search = event.currentTarget.value;
    pushSearch(search);
  }

  function clear(): void {
    pushSearch.cancel();
    pushed = '';
    search = '';
    controller.clearFilter();
  }

  function closeTagsOnOutsideClick(event: MouseEvent): void {
    const target = event.target;
    if (!tagsOpen || !(target instanceof Node)) return;
    if (tagSelect?.contains(target) !== true) tagsOpen = false;
  }
</script>

<svelte:window
  onclick={closeTagsOnOutsideClick}
  onkeydown={(event) => {
    if (event.key === 'Escape' && tagsOpen) tagsOpen = false;
  }}
/>

<div class="tm-toolbar">
  <input
    class="tm-search"
    type="search"
    aria-label="Search descriptions and file paths"
    placeholder="Search description or path…"
    value={search}
    oninput={onSearch}
  />

  <div class="tm-tag-select" bind:this={tagSelect}>
    <button
      class="tm-toolbar-button"
      aria-expanded={tagsOpen}
      onclick={() => (tagsOpen = !tagsOpen)}
    >
      tags{snapshot.filter.tags.length > 0 ? ` (${snapshot.filter.tags.length})` : ''}
      <span class="tm-chevron">{tagsOpen ? '▾' : '▸'}</span>
    </button>
    {#if tagsOpen}
      <ul class="tm-tag-list">
        {#each snapshot.tagFacets as facet (facet.tag)}
          <li>
            <label>
              <input
                type="checkbox"
                checked={snapshot.filter.tags.includes(facet.tag)}
                onchange={() => controller.toggleTag(facet.tag)}
              />
              <span class="tag">#{facet.tag}</span>
              <span class="tm-tag-count">{facet.count}</span>
            </label>
          </li>
        {/each}
        {#if snapshot.tagFacets.length === 0}
          <li class="tm-tag-empty">No tags in the index yet.</li>
        {/if}
      </ul>
    {/if}
  </div>

  <div class="tm-mode" role="group" aria-label="Match any or all selected tags">
    {#each MODES as mode (mode)}
      <button
        class="tm-toolbar-button"
        class:tm-selected={snapshot.filter.tagMode === mode}
        aria-pressed={snapshot.filter.tagMode === mode}
        onclick={() => controller.setTagMode(mode)}>{mode}</button
      >
    {/each}
  </div>

  <label class="tm-sort">
    sort:
    <select
      value={snapshot.sort}
      onchange={(event) =>
        controller.setSort(event.currentTarget.value as Settings['fallbackSort'])}
    >
      {#each SORTS as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </select>
  </label>

  <label class="tm-show-done">
    <input
      type="checkbox"
      checked={snapshot.showDone}
      onchange={(event) => void controller.setShowDone(event.currentTarget.checked)}
    />
    show done
  </label>

  {#if snapshot.filtering}
    <button class="tm-toolbar-button tm-clear" onclick={clear}>clear filter</button>
  {/if}
</div>
