import { get } from "svelte/store"
import type { ShowList } from "../../types/Show"
import { sortObjectNumbers } from "../components/helpers/array"
import { similarity } from "../converters/txt"
import { categories, drawerTabsData, textCache } from "../stores"
import { getHymnDisplayName, isNepaliHymn } from "./hymns"

const specialChars = /[.,\/#!?$%\^&\*;:{}=\-_'"´`~()]/g
export function formatSearch(value: string, removeSpaces = false) {
    if (typeof value !== "string") return ""
    let newValue = value
        .toLowerCase()
        .replace(specialChars, "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[\u200b-\u200d\ufeff]/g, "")
    if (removeSpaces) newValue = newValue.replace(/\s+/g, "")

    return newValue
}

function formatSearchVariants(value: string, removeSpaces = false) {
    const formatted = formatSearch(value, false)
    const compact = compactRomanizedSearch(formatted)
    const variants = [formatted, compact].map((variant) => (removeSpaces ? variant.replace(/\s+/g, "") : variant))
    return [...new Set(variants.filter(Boolean))]
}

function compactRomanizedSearch(value: string) {
    return value
        .replace(/([bcdfghjklmnpqrstvwxyz])a(?=w)/gi, "$1")
        .replace(/(kh|gh|chh|jh|th|dh|ph|bh)a\b/gi, "$1")
        .replace(/([bcdfgjklmnpqrstvwxyz])a\b/gi, "$1")
}

export function tokenize(str: string): string[] {
    return str.toLowerCase().split(/\s+/).filter(Boolean)
}

// check if all old tokens are still in new tokens
export function isRefinement(newTokens: string[], oldTokens: string[]): boolean {
    return oldTokens.length ? oldTokens.every((token) => newTokens.includes(token)) : false
}

export function showSearch(searchValue: string, shows: ShowList[]): ShowList[] {
    // WIP return fastSearch(searchValue, shows)

    let newShows: ShowList[] = []

    // fix invalid regular expression
    searchValue = searchValue.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1")

    shows.forEach((s) => {
        // don't search show if archived
        const isArchived = get(categories)[s.category || ""]?.isArchive
        if (isArchived && get(drawerTabsData).shows?.activeSubTab !== s.category) return

        const match = showSearchFilter(searchValue, s)
        if (match) newShows.push({ ...s, match })
    })
    newShows = sortObjectNumbers(newShows, "match", true)

    // change all values relative to the highest value
    const highestValue = newShows[0]?.match || 0
    newShows = newShows.map((a) => ({ ...a, originalMatch: a.match, match: ((a.match || 0) / highestValue) * 100 }))

    return newShows
}

export function showSearchFilter(searchValue: string, show: ShowList) {
    if (!show.name) return 0

    // WIP tag search?

    // Priority 0: Song Number Exact Match (supports alphanumeric like "MP133")
    const songNumbers = getShowNumbers(show)
    const songNumber = songNumbers[0] || ""
    const formattedSongNumbers = songNumbers.map((number) => formatSearch(number, true))
    const formattedSearchValues = formatSearchVariants(searchValue, true)
    const formattedSearchWordValues = formatSearchVariants(searchValue, false)
    const formattedSearchValue = formattedSearchValues[0] || ""
    if (!formattedSearchValue) return 0
    if (formattedSongNumbers.some((number) => formattedSearchValues.includes(number))) return 100
    // Priority 0.5: CCLI Exact Match
    const songId = show.quickAccess?.metadata?.CCLI || ""
    if (songId.toString() === searchValue) return 100

    const displayName = isNepaliHymn(show) ? getHymnDisplayName(show) : show.name
    const extraSearchText = getExtraSearchText(show)
    const showNameFields = [displayName, show.quickAccess?.romanizedTitle, show.quickAccess?.englishTitle]
        .filter((value) => typeof value === "string" && value.trim().length)
        .flatMap((value) => formatSearchVariants(value, true))
    const showName = showNameFields[0] || ""
    const showNameWithNumber = (formattedSongNumbers[0] || "") + showName
    const showNamesWithNumber = showNameFields.flatMap((name) => formattedSongNumbers.map((number) => number + name))

    // Priority 1: Title Exact Match
    if (showNameFields.some((name) => formattedSearchValues.includes(name)) || showNamesWithNumber.some((name) => formattedSearchValues.includes(name))) return 100

    // Priority 1.25: Song Number Starts With Match
    // if (songNumber && formattedSongNumber.startsWith(formattedSearchValue)) return 100

    // Priority 1.5: Title Word Start Match
    if (showNameFields.some((name) => formattedSearchValues.some((search) => name.startsWith(search)))) return 100

    const cache = [get(textCache)[show.id] || "", extraSearchText].filter(Boolean).join("\n")

    // Multi-word search - check if ALL words appear in content
    const multiWordMatchScore = calculateMultiWordMatch(searchValue, cache, displayName)

    // Priority 2: Content Includes Percentage Match
    const contentIncludesMatchScore = maxScore(formattedSearchWordValues.map((search) => calculateContentIncludesScore(cache, search))) // + calculateContentIncludesScore(cache, searchValue, true)

    // Priority 3: Title Word-for-Word Match
    const titleWordMatch = maxScore(formattedSearchWordValues.flatMap((search) => [showNameWithNumber, ...showNamesWithNumber].map((name) => matchWords(name, search))))
    const titleIncludesMatchScore = titleWordMatch * 0.5 * 100 // max 50%

    // Priority 4: Title Letter-for-Letter Match
    const titleSimilarity = maxScore(formattedSearchValues.flatMap((search) => [showNameWithNumber, ...showNamesWithNumber].map((name) => similarity(name, removeShortWords(search)))))
    const titleSimilarityMatchScore = titleSimilarity * 0.3 * 100 // max 30%

    // Priority 5: Content Word-for-Word Match
    let contentWordMatchScore = 0
    if (cache) {
        const formattedCache = formatSearch(cache, true)
        contentWordMatchScore = maxScore(
            formattedSearchWordValues.map((search) => {
                const wordMatchCount = matchWords(formattedCache, search)
                const wordMatchCountExtra = matchWords(formattedCache, removeShortWords(search))
                return Math.min(wordMatchCount, 100) * 0.03 + Math.min(wordMatchCountExtra, 100) * 0.07
            })
        ) // max 10%
    }

    // Priority 6: Content Letter-for-Letter Match
    // let contentSimilarityMatchScore = 0
    // if (cache) {
    //     const contentSimilarity = similarity(removeShortWords(formatSearch(cache, true)), removeShortWords(formatSearch(searchValue, true)))
    //     contentSimilarityMatchScore = contentSimilarity * 0.05 * 100 // max 5%
    // }

    const combinedScore = multiWordMatchScore + contentIncludesMatchScore + titleIncludesMatchScore + titleSimilarityMatchScore + contentWordMatchScore
    return combinedScore >= 100 ? 99 : combinedScore < 3 ? 0 : combinedScore
}

function maxScore(values: number[]) {
    return Math.max(0, ...values.filter((value) => Number.isFinite(value)))
}

function getExtraSearchText(show: ShowList) {
    const values = [...getShowNumbers(show), show.quickAccess?.originalCode, show.quickAccess?.categoryCode, show.quickAccess?.searchText, show.quickAccess?.romanizedLyrics, show.quickAccess?.romanizedTitle, show.quickAccess?.englishTitle]
    return values.flatMap((value) => (Array.isArray(value) ? value : [value])).filter((value) => typeof value === "string" && value.trim().length).join("\n")
}

function getShowNumbers(show: ShowList) {
    const quickAccess = show.quickAccess || {}
    const values = [quickAccess.number, quickAccess.originalNumber, quickAccess.categoryNumber, quickAccess.paddedNumber, quickAccess.sourceNumber]
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
}

function calculateMultiWordMatch(searchValue: string, cache: string, showName: string): number {
    return 0 // WIP got worse results with this
    const queryWords = tokenize(searchValue).filter((w) => w.length >= 3)
    const contentLower = formatSearch(cache, false)
    const nameLower = formatSearch(showName, false)

    let wordMatchScore = 0
    if (queryWords.length > 0) {
        let nameMatches = 0
        let contentMatches = 0

        for (const word of queryWords) {
            if (nameLower.includes(word)) nameMatches++
            if (contentLower.includes(word)) contentMatches++
        }

        // Score based on percentage of words matched
        const nameMatchRatio = nameMatches / queryWords.length
        const contentMatchRatio = contentMatches / queryWords.length

        // Name matches are more valuable
        wordMatchScore = nameMatchRatio * 40 + contentMatchRatio * 30
    }

    return wordMatchScore
}

function calculateContentIncludesScore(cache: string, search: string, noShortWords = false): number {
    if (!cache) return 0

    // remove short words
    cache = formatSearch(noShortWords ? removeShortWords(cache) : cache, true)
    search = formatSearch(noShortWords ? removeShortWords(search) : search, true)

    let re
    try {
        re = new RegExp(search, "g")
    } catch (err) {
        console.error(err)
        return 0
    }

    const occurrences = (cache.match(re) || []).length
    const cacheLength = cache.length

    // content includes match score, based on occurrences relative to cache length
    if (cacheLength > 0) {
        const percentageMatch = Math.min(((occurrences * search.length) / cacheLength) * 40, 1)
        // return percentageMatch * (noShortWords ? 20 : 50) // max 70%
        return percentageMatch * 70 // max 70%
    }

    return 0
}

function removeShortWords(value: string) {
    return value
        .split(" ")
        .filter((a) => a.length > 2)
        .join(" ")
}

function matchWords(text: string, value: string): number {
    const words = value.split(" ").filter(Boolean)
    const matchCount = words.filter((word) => text.includes(word)).length

    // value between 0 and 1
    return matchCount / words.length
}
