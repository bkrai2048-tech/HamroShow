import { uid } from "uid"
import { formatToFileName } from "../components/helpers/show"
import { activePopup, alertMessage, drawerTabsData, scriptures, scripturesCache } from "../stores"
import { translateText } from "../utils/language"
import { convertBebliaBible } from "./bebliaBible"
import { defaultBibleBookNames } from "./bebliaBible"
import { convertOpenSongBible } from "./opensong"
import { convertOSISBible } from "./osisBible"
import { convertZefaniaBible } from "./zefaniaBible"

const bibleTypes = {
    freeshow: { name: "HamroShow", func: importFSB },
    bookjson: { name: "Book JSON", func: importBookJsonBible },
    zefania: { name: "Zefania", func: convertZefaniaBible },
    osis: { name: "OSIS", func: convertOSISBible },
    beblia: { name: "Beblia", func: convertBebliaBible },
    opensong: { name: "OpenSong", func: convertOpenSongBible }
}

export function importBibles(data: any[]) {
    alertMessage.set("popup.importing")
    activePopup.set("alert")

    // timeout to allow popup to display
    setTimeout(() => {
        const success: { [key: string]: number } = {}
        const unsupported: { [key: string]: number } = {}

        const bookJsonFiles = data.filter((file) => file.type === "bookjson")
        if (bookJsonFiles.length) {
            success[bibleTypes.bookjson.name] = bookJsonFiles.length
            importBookJsonBible(bookJsonFiles)
        }

        data.filter((file) => file.type !== "bookjson").forEach((file) => {
            let type = file.type
            if (type === "fsb" || !type) type = "freeshow"

            if (bibleTypes[type]) {
                const name = bibleTypes[type].name
                if (!success[name]) success[name] = 0
                success[name]++
                bibleTypes[type].func([file])
            } else {
                const id = type || file.name
                if (!unsupported[id]) unsupported[id] = 0
                unsupported[id]++
            }
        })

        let message = ""
        if (Object.keys(success).length) {
            message += translateText("✓ actions.imported")
            Object.entries(success).forEach(([key, count]) => {
                message += `<br>• ${key}`
                if (count > 1) message += ` <span style="opacity: 0.5;">(${count})</span>`
            })
        }
        if (Object.keys(unsupported).length) {
            if (Object.keys(success).length) message += "<br><br>"

            message += translateText("✕ error.import")
            Object.entries(unsupported).forEach(([key, count]) => {
                message += `<br>• ${key}`
                if (count > 1) message += ` <span style="opacity: 0.5;">(${count})</span>`
            })

            // add link to Bible Converter
            message += `<br><br>Try another version or use this link#bible-converter!`
        }

        alertMessage.set(message)
    }, 200)
}

export function importFSB(data: any[]) {
    data.forEach(({ content, name }) => {
        let bible: any = null
        try {
            bible = JSON.parse(content)
        } catch (err) {
            console.error(err)
        }

        if (!bible) return

        const id: string = bible[0] || uid()
        bible = bible[1] || bible
        if (!Array.isArray(bible?.books)) return

        scripturesCache.update((a) => {
            a[id] = bible
            return a
        })

        name = formatToFileName(bible.name || name)

        scriptures.update((a) => {
            a[id] = { name, id }
            return a
        })

        setActiveScripture(id)
    })
}

export function importBookJsonBible(data: any[]) {
    const importedBooks = data.flatMap(parseBookJsonFile).filter((book) => book.chapters.length)
    if (!importedBooks.length) return

    const booksByNumber = new Map<number, any>()
    importedBooks.forEach((book) => booksByNumber.set(book.number, book))

    const displayName = inferImportedBibleName(data)
    const fileName = formatToFileName(displayName)
    const id = uid()
    const bible = {
        name: fileName,
        metadata: { title: displayName },
        books: Array.from(booksByNumber.values()).sort((a, b) => Number(a.number) - Number(b.number))
    }

    scripturesCache.update((a) => {
        a[id] = bible
        return a
    })

    scriptures.update((a) => {
        a[id] = { name: fileName, id, customName: displayName }
        return a
    })

    setActiveScripture(id)
}

function parseBookJsonFile(file: any) {
    let parsed: any = null
    try {
        parsed = JSON.parse(file.content)
    } catch (err) {
        console.error(err)
        return []
    }

    const payload = Array.isArray(parsed) && parsed.length === 2 ? parsed[1] : parsed
    const candidates = Array.isArray(payload) ? payload : payload?.books && Array.isArray(payload.books) ? payload.books : [payload]

    return candidates.map((book: any) => convertBookJson(book, file)).filter(Boolean)
}

function convertBookJson(source: any, file: any) {
    if (!source || typeof source !== "object" || !Array.isArray(source.chapters)) return null

    const name = normalizeBookDisplayName(source.book || source.name || file.name || "")
    const number = getBookNumber(name, source.number)
    if (!number) return null

    return {
        number,
        name: defaultBibleBookNames[number] || name,
        chapters: source.chapters
            .map((chapter: any, index: number) => ({
                number: Number(chapter.chapter || chapter.number || index + 1),
                verses: (chapter.verses || [])
                    .map((verse: any, verseIndex: number) => ({
                        number: Number(verse.verse || verse.number || verseIndex + 1),
                        text: normalizeImportedBibleText(verse.text || verse.value || "")
                    }))
                    .filter((verse: any) => verse.number && verse.text.trim())
            }))
            .filter((chapter: any) => chapter.number && chapter.verses.length)
    }
}

function getBookNumber(name: string, fallback: any) {
    const explicitNumber = Number(fallback)
    if (explicitNumber > 0 && explicitNumber <= 66) return explicitNumber

    const normalized = normalizeBookKey(name)
    return Number(Object.entries(defaultBibleBookNames).find(([_number, bookName]) => normalizeBookKey(bookName) === normalized)?.[0] || 0)
}

function normalizeBookDisplayName(value: string) {
    return String(value || "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function normalizeBookKey(value: string) {
    return normalizeBookDisplayName(value)
        .toLowerCase()
        .replace(/^psalm$/, "psalms")
        .replace(/^song of songs$/, "song of solomon")
        .replace(/^revelation of john$/, "revelation")
        .replace(/[^a-z0-9]/g, "")
}

function normalizeImportedBibleText(value: string) {
    return String(value || "")
        .replace(/â€”/g, "-")
        .replace(/â€“/g, "-")
        .replace(/â€˜/g, "'")
        .replace(/â€™/g, "'")
        .replace(/â€œ/g, '"')
        .replace(/â€/g, '"')
        .replace(/Â /g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function inferImportedBibleName(data: any[]) {
    const candidates = data.flatMap((file) => [file.path, file.name]).filter(Boolean).map(String)
    if (candidates.some((value) => /\bniv\b|new international version/i.test(value))) return "NIV Bible"

    const firstPath = String(data[0]?.path || "")
    const parent = firstPath.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] || ""
    const parentName = normalizeBookDisplayName(parent)
    if (parentName && !/^(bibles?|json|scriptures?)$/i.test(parentName)) return titleCase(parentName)

    return "Imported Bible"
}

function titleCase(value: string) {
    return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function setActiveScripture(tabId: string) {
    drawerTabsData.update((a) => {
        a.scripture = { ...a.scripture, activeSubTab: tabId }
        return a
    })
}
