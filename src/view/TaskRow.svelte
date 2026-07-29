<script lang="ts">
  import type { TaskMasterController } from '../controller';
  import type { Row } from '../model/filter';
  import { splitInline } from '../model/inline';
  import { DATE_GLYPHS, PRIORITY_GLYPHS } from '../model/tokens';
  import type { DateKind } from '../model/types';

  const { row, controller }: { row: Row; controller: TaskMasterController } = $props();

  const task = $derived(row.task);
  const parts = $derived(splitInline(task.description));
  // The glyph vocabulary lives in the lexer, so the row never spells one out.
  const glyphs = new Map<DateKind, string>(DATE_GLYPHS.map(([glyph, kind]) => [kind, glyph]));
  const priorityGlyph = $derived(
    PRIORITY_GLYPHS.find(([, priority]) => priority === task.priority)?.[0],
  );
  const done = $derived(task.status === 'done' || task.status === 'cancelled');
  const cancelled = $derived(task.status === 'cancelled');
  const dated = $derived(
    (['due', 'done', 'cancelled'] as const).flatMap((kind) => {
      const value = task.dates[kind];
      return value === undefined ? [] : [{ kind, glyph: glyphs.get(kind) ?? '', value }];
    }),
  );

  function follow(event: MouseEvent, action: () => void): void {
    event.preventDefault();
    event.stopPropagation();
    action();
  }
</script>

<div
  class="tm-row"
  class:tm-row-done={done}
  class:tm-row-cancelled={cancelled}
  class:tm-row-locked={!task.roundTrips}
>
  <div class="tm-row-main">
    <input
      class="task-list-item-checkbox"
      type="checkbox"
      checked={task.status === 'done'}
      data-task={task.statusChar}
      aria-label={task.description}
      onclick={(event) => event.preventDefault()}
    />
    <span class="tm-description">
      {#each parts as part, index (index)}
        {#if part.kind === 'text'}{part.text}{:else if part.kind === 'wikilink'}<a
            class="internal-link"
            href={part.target}
            onclick={(event) => follow(event, () => void controller.openLink(part.target, task.file))}
            >{part.text}</a
          >{:else}<a class="external-link" href={part.target} rel="noopener">{part.text}</a>{/if}
      {/each}
    </span>
  </div>

  <div class="tm-row-meta">
    {#if !task.roundTrips}
      <span class="tm-warning" title="This line does not round-trip, so it is read-only here."
        >⚠</span
      >
    {/if}
    {#if row.conflicts.length > 0}
      <span class="tm-warning" title={`More than one lane tag: ${row.conflicts.join(', ')}`}>⚠</span>
    {/if}
    <!-- Keyed by position: a line may repeat a tag, and a repeated key throws. -->
    {#each task.tags as tag, index (index)}
      <a class="tag" href={`#${tag}`} onclick={(event) => event.preventDefault()}>#{tag}</a>
    {/each}
    {#if priorityGlyph}
      <span class="tm-glyph">{priorityGlyph}</span>
    {/if}
    {#if cancelled && task.dates.cancelled === undefined}
      <span class="tm-glyph">{glyphs.get('cancelled')}</span>
    {/if}
    {#each dated as date (date.kind)}
      <span class="tm-glyph">{date.glyph} {date.value}</span>
    {/each}
    {#each task.contextLinks as link, index (index)}
      {#if link.kind === 'wikilink'}
        <a
          class="internal-link tm-context-link"
          href={link.target}
          onclick={(event) => follow(event, () => void controller.openLink(link.target, task.file))}
          >{link.alias ?? link.target}</a
        >
      {:else}
        <a class="external-link tm-context-link" href={link.target} rel="noopener"
          >{link.alias ?? link.target}</a
        >
      {/if}
    {/each}
    <button
      class="tm-open"
      title={`${task.file}, line ${task.line + 1}`}
      onclick={() => void controller.openTask(task)}>open in file</button
    >
  </div>
</div>
