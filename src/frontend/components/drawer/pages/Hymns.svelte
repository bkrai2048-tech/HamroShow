<script lang="ts">
    import type { ShowList } from "../../../../types/Show"
    import { activeEdit, activeFocus, activeShow, focusedArea, focusMode, sortedShowsList, special } from "../../../stores"
    import { formatSearch, showSearch } from "../../../utils/search"
    import { getHymnCategoryName, getHymnDisplayName, getHymnDisplayNumber, isNepaliHymn, sortNepaliHymns, type HymnSortDirection, type HymnSortMode } from "../../../utils/hymns"
    import Icon from "../../helpers/Icon.svelte"
    import SelectElem from "../../system/SelectElem.svelte"
    import Center from "../../system/Center.svelte"
    import VirtualList from "../VirtualList.svelte"
    import ShowButton from "../../inputs/ShowButton.svelte"
    import T from "../../helpers/T.svelte"

    function updateSpecial(value: boolean, key: string) {
        special.update((data) => {
            if (!value) delete data[key]
            else data[key] = value

            return data
        })
    }

    export let active: string | null
    export let searchValue: string
    export let firstMatch: null | any = null

    let sortMode: HymnSortMode = "number"
    let sortDirection: HymnSortDirection = "asc"

    $: selectedCategory = active || "all"
    $: formattedSearch = formatSearch(searchValue)
    $: allHymns = sortNepaliHymns($sortedShowsList.filter(isNepaliHymn), sortMode, sortDirection)
    $: categoryHymns = selectedCategory === "all" ? allHymns : allHymns.filter((show) => show.category === selectedCategory)
    $: filteredHymns = getFilteredHymns(categoryHymns, formattedSearch, searchValue)
    $: firstMatch = searchValue.length > 1 ? filteredHymns[0] || null : null

    function getFilteredHymns(hymns: ShowList[], search: string, rawSearch: string) {
        if (rawSearch.length <= 1) return hymns

        let results = showSearch(search, hymns)
        if (rawSearch.length > 15 && results.length > 80) results = results.slice(0, 80)
        if (rawSearch.length > 30 && results.length > 40) results = results.slice(0, 40)
        return sortNepaliHymns(results, sortMode, sortDirection).sort((a, b) => getSearchScore(b) - getSearchScore(a))
    }

    function getSearchScore(show: ShowList) {
        return Number(show.originalMatch ?? show.match ?? 0)
    }

    function toggleSort(mode: HymnSortMode) {
        if (sortMode === mode) {
            sortDirection = sortDirection === "asc" ? "desc" : "asc"
            return
        }

        sortMode = mode
        sortDirection = "asc"
    }

    function sortIcon(mode: HymnSortMode) {
        if (sortMode !== mode) return "↕"
        return sortDirection === "asc" ? "↑" : "↓"
    }

    function getSubtitle(show: ShowList) {
        return show.quickAccess?.romanizedTitle || getHymnCategoryName(show.category)
    }

    function keydown(e: KeyboardEvent) {
        if (e.target?.closest("input") || e.target?.closest(".edit") || (!e.ctrlKey && !e.metaKey) || !filteredHymns.length) return
        if ($activeEdit.items.length) return

        let id = ""
        if (e.key === "ArrowRight") {
            if (!$activeShow || ($activeShow.type !== undefined && $activeShow.type !== "show")) id = filteredHymns[0].id
            else {
                const currentIndex = filteredHymns.findIndex((hymn) => hymn.id === $activeShow!.id)
                if (currentIndex < filteredHymns.length - 1) id = filteredHymns[currentIndex + 1].id
            }
        } else if (e.key === "ArrowLeft") {
            if (!$activeShow || ($activeShow.type !== undefined && $activeShow.type !== "show")) id = filteredHymns[filteredHymns.length - 1].id
            else {
                const currentIndex = filteredHymns.findIndex((hymn) => hymn.id === $activeShow!.id)
                if (currentIndex > 0) id = filteredHymns[currentIndex - 1].id
            }
        }

        if (id) {
            if ($focusMode) activeFocus.set({ id, type: "show" })
            else activeShow.set({ id, type: "show" })
        }
    }
</script>

<svelte:window on:keydown={keydown} />

<div class="column" on:mouseup={() => focusedArea.set("show_drawer")}>
    <div class="hymn-search">
        <Icon id="search" size={1.1} white />
        <input class="edit" bind:value={searchValue} placeholder="Search Nepali or English" />
        {#if searchValue}
            <button type="button" class="clear" on:click={() => (searchValue = "")} title="Clear search">
                <Icon id="clear" white />
            </button>
        {/if}
    </div>

    <div class="summary">
        <span>{selectedCategory === "all" ? "All hymns" : getHymnCategoryName(selectedCategory)}</span>
        <div class="summary-actions">
            <button type="button" class:active={$special.repeatChorusAfterVerse} class="chorus-repeat" on:click={() => updateSpecial(!$special.repeatChorusAfterVerse, "repeatChorusAfterVerse")} title="Repeat chorus after each verse">
                <Icon id="loop" size={0.9} white />
                <span>Repeat chorus</span>
            </button>
            <span>{filteredHymns.length}</span>
        </div>
    </div>

    <div class="hymn-columns" aria-label="Hymn sort columns">
        <button type="button" class:active={sortMode === "number"} aria-pressed={sortMode === "number"} on:click={() => toggleSort("number")} title="Sort by hymn number">
            <span>No.</span>
            <span class="sort-icon">{sortIcon("number")}</span>
        </button>
        <button type="button" class:active={sortMode === "alphabet"} aria-pressed={sortMode === "alphabet"} on:click={() => toggleSort("alphabet")} title="Sort by title">
            <span>Title</span>
            <span class="sort-icon">{sortIcon("alphabet")}</span>
        </button>
    </div>

    {#if filteredHymns.length}
        {#key `${selectedCategory}:${sortMode}:${sortDirection}`}
            <VirtualList items={filteredHymns} let:item={hymn} activeIndex={searchValue.length ? -1 : filteredHymns.findIndex((item) => item.id === $activeShow?.id)}>
                <SelectElem id="show_drawer" data={{ id: hymn.id }} shiftRange={filteredHymns} draggable>
                    <ShowButton id={hymn.id} show={hymn} data={getSubtitle(hymn)} class="#drawer_show_button" match={hymn.match || null} isFirst={firstMatch?.id === hymn.id} icon iconLabel={getHymnDisplayNumber(hymn) || null} displayName={getHymnDisplayName(hymn)} hideNumber />
                </SelectElem>
            </VirtualList>
        {/key}
    {:else if searchValue.length > 1}
        <Center size={1.2} faded><T id="empty.search" /></Center>
    {:else}
        <Center size={1.2} faded><T id="empty.shows" /></Center>
    {/if}
</div>

<style>
    .column {
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        background-color: var(--primary-darker);
        height: 100%;

        --number-width: 80px;
        --modified-width: 260px;
    }

    .hymn-search {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 6px 10px;
        background-color: var(--primary-darkest);
        border-bottom: 1px solid var(--primary-lighter);
    }

    .hymn-search input {
        flex: 1;
        min-width: 0;
        border: none;
        border-radius: 4px;
        padding: 6px 8px;
        color: var(--text);
        background-color: rgb(0 0 0 / 0.22);
        font: inherit;
    }

    .hymn-search input:focus {
        outline: 2px solid var(--secondary);
        outline-offset: -2px;
    }

    .clear {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 4px;
        background-color: transparent;
        color: var(--text);
    }

    .summary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        min-height: 28px;
        padding: 0 12px;
        font-size: 0.78em;
        font-weight: 600;
        opacity: 0.78;
        border-bottom: 1px solid var(--primary-lighter);
    }

    .summary-actions {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .chorus-repeat {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 22px;
        border: 1px solid color-mix(in srgb, var(--secondary) 28%, transparent);
        border-radius: 4px;
        padding: 1px 7px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        font: inherit;
        font-size: 0.92em;
        font-weight: 700;
        opacity: 0.82;
    }

    .chorus-repeat:hover,
    .chorus-repeat.active {
        background: color-mix(in srgb, var(--secondary) 18%, transparent);
        opacity: 1;
    }

    .chorus-repeat.active {
        color: var(--secondary);
    }

    .hymn-columns {
        display: flex;
        align-items: center;
        gap: 1px;
        min-height: 30px;
        padding: 0 12px;
        border-bottom: 1px solid var(--primary-lighter);
        background-color: var(--primary-darkest);
    }

    .hymn-columns button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 24px;
        padding: 2px 8px;
        border: none;
        border-radius: 4px;
        color: var(--text);
        background-color: transparent;
        font: inherit;
        font-weight: 700;
        opacity: 0.82;
    }

    .hymn-columns button:first-child {
        width: 68px;
        margin-inline-end: 8px;
    }

    .hymn-columns button:nth-child(2) {
        flex: 1;
        min-width: 0;
    }

    .hymn-columns button:hover {
        background-color: var(--hover);
        opacity: 1;
    }

    .hymn-columns button.active {
        color: var(--primary-darkest);
        background-color: var(--secondary);
        opacity: 1;
    }

    .sort-icon {
        width: 1.2em;
        text-align: center;
        font-size: 1.05em;
        line-height: 1;
    }

    .column :global(svelte-virtual-list-viewport) {
        padding-bottom: 60px;
    }

    @media screen and (max-width: 750px) {
        .hymn-search {
            padding: 5px 7px;
        }

        .summary {
            font-size: 0.72em;
            flex-wrap: wrap;
        }
    }
</style>