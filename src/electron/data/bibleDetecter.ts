type FileTypes = "freeshow" | "bookjson" | "zefania" | "osis" | "opensong" | "beblia" | "softprojector" | "wordproject" | "biblequote" | "ibible" | "sqlite" | "mdb"

export function detectFileType(content: string): FileTypes | null {
    const jsonType = detectJsonBibleType(content)
    if (jsonType) return jsonType

    // JSON
    if (content.includes('"books":') && content.includes('"number":') && content.includes('"text":')) return "freeshow"

    // XML
    if (content.includes("XMLBIBLE") && content.includes("BIBLEBOOK")) return "zefania"
    if (content.includes("osisText") && content.includes("osisID")) return "osis"
    if (content.includes("bible") && content.includes("b n=") && content.includes("v n=")) return "opensong"
    if (content.includes("bible") && content.includes("verse number=")) return "beblia"
    // TXT (Custom)
    if (content.includes("spDataVersion:") && content.includes("C001V001")) return "softprojector"
    // HTM(L)
    if (content.includes('<li><a title="') && content.includes("Wordproject")) return "wordproject"
    if (content.includes("PathName") && content.includes("BibleName")) return "biblequote"
    if (content.includes("ibibles.net")) return "ibible"

    // SQLITE
    if (content.includes("SQLite")) return "sqlite"
    // Microsoft Access Database
    if (content.includes("Standard Jet DB")) return "mdb"

    return null
}

function detectJsonBibleType(content: string): FileTypes | null {
    const trimmed = content.trim()
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return null

    try {
        const parsed = JSON.parse(trimmed)
        const payload = Array.isArray(parsed) && parsed.length === 2 ? parsed[1] : parsed

        if (payload?.books && Array.isArray(payload.books)) return "freeshow"
        if (isBookJson(payload)) return "bookjson"
        if (Array.isArray(payload) && payload.some(isBookJson)) return "bookjson"
    } catch {
        return null
    }

    return null
}

function isBookJson(value: any) {
    return !!value && typeof value === "object" && !!(value.book || value.name) && Array.isArray(value.chapters)
}
