import type { ShowList, TrimmedShow } from "../../types/Show"

export type HymnSortMode = "number" | "alphabet"
export type HymnSortDirection = "asc" | "desc"

export const HYMN_CATEGORY_NAMES: Record<string, string> = {
    ne_bhajan: "Bhajan / भजन",
    ne_chorus: "Chorus / कोरस",
    ne_bal_sangati: "Bal Sangati / बाल सङ्गति",
    ne_new_songs: "New Songs / नयाँ गीत"
}

export const HYMN_CATEGORY_FILTERS = [
    { id: "ne_bhajan", label: HYMN_CATEGORY_NAMES.ne_bhajan, icon: "song" },
    { id: "ne_chorus", label: HYMN_CATEGORY_NAMES.ne_chorus, icon: "song" },
    { id: "ne_bal_sangati", label: HYMN_CATEGORY_NAMES.ne_bal_sangati, icon: "song" },
    { id: "ne_new_songs", label: HYMN_CATEGORY_NAMES.ne_new_songs, icon: "song" }
]

const HYMN_CATEGORY_ORDER = HYMN_CATEGORY_FILTERS.reduce<Record<string, number>>((order, category, index) => {
    order[category.id] = index
    return order
}, {})

export function isNepaliHymn(show: (TrimmedShow | ShowList) & { id?: string }) {
    return show?.origin === "ncs_nepal" || String(show?.id || "").startsWith("ncs_song_")
}

export function getHymnCategoryName(category: string | null | undefined) {
    return HYMN_CATEGORY_NAMES[category || ""] || "Hymn"
}

export function getHymnDisplayNumber(show: (TrimmedShow | ShowList) & { meta?: { number?: string } }) {
    const quickAccess = show?.quickAccess || {}
    return String(quickAccess.categoryNumber || quickAccess.originalNumber || quickAccess.number || show?.meta?.number || "").trim()
}

export function getHymnDisplayName(show: TrimmedShow | ShowList) {
    return String(show?.name || "").replace(/__song\d+$/i, "").trim()
}

export function sortNepaliHymns(hymns: ShowList[], mode: HymnSortMode = "number", direction: HymnSortDirection = "asc") {
    const multiplier = direction === "asc" ? 1 : -1

    return [...hymns].sort((a, b) => {
        if (mode === "alphabet") return compareHymnNames(a, b) * multiplier

        const categoryA = HYMN_CATEGORY_ORDER[a.category || ""] ?? Number.MAX_SAFE_INTEGER
        const categoryB = HYMN_CATEGORY_ORDER[b.category || ""] ?? Number.MAX_SAFE_INTEGER
        if (categoryA !== categoryB) return categoryA - categoryB

        const numberA = getHymnSortNumber(a)
        const numberB = getHymnSortNumber(b)
        if (numberA !== numberB) return (numberA - numberB) * multiplier

        return compareHymnNames(a, b)
    })
}

function compareHymnNames(a: ShowList, b: ShowList) {
    return getHymnDisplayName(a).localeCompare(getHymnDisplayName(b), "ne")
}

function getHymnSortNumber(show: ShowList) {
    const number = Number.parseInt(getHymnDisplayNumber(show), 10)
    return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER
}