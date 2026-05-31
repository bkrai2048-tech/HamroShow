<script lang="ts">
    import { drawerTabsData, sortedShowsList } from "../../../stores"
    import { HYMN_CATEGORY_FILTERS, isNepaliHymn } from "../../../utils/hymns"
    import NavigationSections from "./NavigationSections.svelte"

    $: activeSubTab = $drawerTabsData.hymns?.activeSubTab || ""
    $: hymnShows = $sortedShowsList.filter(isNepaliHymn)

    function countFor(categoryId: string) {
        return hymnShows.reduce((count, show) => count + (show.category === categoryId ? 1 : 0), 0)
    }

    $: sections = [
        [{ id: "all", label: "hymns.all", icon: "all", count: hymnShows.length }],
        [{ id: "TITLE", label: "hymns.categories" }, ...HYMN_CATEGORY_FILTERS.map((category) => ({ ...category, count: countFor(category.id), customIcon: true, boxedIcon: true }))]
    ]
</script>

<NavigationSections {sections} active={activeSubTab} />