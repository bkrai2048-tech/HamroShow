const HALANT = "\u094D"

const consonantMap: Record<string, string> = {
    k: "क",
    q: "क",
    K: "ख",
    g: "ग",
    G: "घ",
    c: "च",
    C: "छ",
    j: "ज",
    z: "झ",
    T: "ट",
    D: "ड",
    N: "ण",
    t: "त",
    d: "द",
    n: "न",
    p: "प",
    f: "फ",
    F: "फ",
    b: "ब",
    B: "भ",
    V: "भ",
    m: "म",
    y: "य",
    r: "र",
    l: "ल",
    v: "व",
    w: "व",
    s: "स",
    S: "श",
    h: "ह",
    x: "क्ष"
}

const vowelMap: Record<string, string> = {
    a: "अ",
    A: "आ",
    i: "इ",
    I: "ई",
    u: "उ",
    U: "ऊ",
    e: "ए",
    o: "ओ",
    M: "अं",
    ":": "अः",
    "~": "अँ"
}

const matraMap: Record<string, string> = {
    a: "",
    A: "ा",
    i: "ि",
    I: "ी",
    u: "ु",
    U: "ू",
    e: "े",
    o: "ो",
    M: "ं",
    ":": "ः",
    "~": "ँ"
}

const symbolMap: Record<string, string> = {
    "0": "०",
    "1": "१",
    "2": "२",
    "3": "३",
    "4": "४",
    "5": "५",
    "6": "६",
    "7": "७",
    "8": "८",
    "9": "९",
    ".": "।",
    "|": "।"
}

const modifierMap: Record<string, Record<string, string>> = {
    क: { h: "ख", s: "क्ष", S: "क्ष" },
    ग: { h: "घ", y: "ग्य" },
    च: { h: "छ" },
    ज: { h: "झ", n: "ज्ञ" },
    ट: { h: "ठ", r: "ट्र" },
    ड: { h: "ढ" },
    त: { h: "थ", r: "त्र" },
    द: { h: "ध" },
    प: { h: "फ" },
    ब: { h: "भ" },
    न: { g: "ङ" },
    ण: { G: "ङ", Y: "ञ" },
    य: { n: "ञ" },
    र: { r: "र", y: "र्य" },
    स: { h: "श" },
    श: { h: "ष", r: "श्र" }
}

export function convertRomanizedInsert(value: string, selectionStart: number, selectionEnd: number, insertedText: string) {
    let before = value.slice(0, selectionStart)
    const after = value.slice(selectionEnd)

    Array.from(insertedText).forEach((char) => {
        before = appendRomanizedChar(before, char)
    })

    return { value: before + after, cursor: before.length }
}

export function transliterateRomanizedText(value: string) {
    return convertRomanizedInsert("", 0, 0, value).value
}

function appendRomanizedChar(before: string, char: string) {
    if (!char || char === "\r") return before
    if (char === "\n" || char === " " || char === "\t") return before + char

    const contextChar = before[before.length - 1] || ""
    const hasHalant = contextChar === HALANT
    const prevConsonant = hasHalant ? before[before.length - 2] || "" : ""

    if (char === ":" && shouldKeepLiteralColon(contextChar)) return before + ":"
    if (char === "~" && contextChar === "ं") return before.slice(0, -1) + "ँ"
    if (before.endsWith("क्ष" + HALANT) && char === "h") return before

    if (hasHalant && prevConsonant && modifierMap[prevConsonant]?.[char]) {
        return before.slice(0, -2) + modifierMap[prevConsonant][char] + HALANT
    }

    if (contextChar === "R" && (char === "i" || char === "I")) {
        const beforeR = before.slice(0, -1)
        const charBeforeR = beforeR[beforeR.length - 1] || ""
        if (charBeforeR === HALANT) return beforeR.slice(0, -1) + (char === "I" ? "ॄ" : "ृ")
        return beforeR + (char === "I" ? "ॠ" : "ऋ")
    }

    if (vowelMap[char] !== undefined) {
        if (hasHalant && prevConsonant) {
            if (char === "a") return before.slice(0, -1)
            if (matraMap[char] !== undefined) return before.slice(0, -1) + matraMap[char]
        }

        if (isDevanagariConsonant(contextChar)) {
            if (char === "i") return before + "ै"
            if (char === "u") return before + "ौ"
            if (char === "a") return before + "ा"
            if (matraMap[char] !== undefined) return before + matraMap[char]
            return before + vowelMap[char]
        }

        if (isDevanagariVowelOrMatra(contextChar) && matraMap[char] !== undefined) return before + matraMap[char]

        if (contextChar === "अ" && char === "i") return before.slice(0, -1) + "ऐ"
        if (contextChar === "अ" && char === "u") return before.slice(0, -1) + "औ"

        return before + vowelMap[char]
    }

    if (matraMap[char] !== undefined && matraMap[char]) return before + matraMap[char]
    if (consonantMap[char]) return before + consonantMap[char] + HALANT
    if (char === "." && before.endsWith("।")) return before.slice(0, -1) + "."
    if (symbolMap[char]) return before + symbolMap[char]

    return before + char
}

function isDevanagariConsonant(char: string) {
    if (!char) return false
    const code = char.charCodeAt(0)
    return code >= 0x0915 && code <= 0x0939
}

function isDevanagariVowelOrMatra(char: string) {
    if (!char) return false
    const code = char.charCodeAt(0)
    return (code >= 0x0904 && code <= 0x0914) || (code >= 0x093E && code <= 0x094C) || char === "ं" || char === "ँ" || char === "ः" || isDevanagariConsonant(char)
}

function shouldKeepLiteralColon(contextChar: string) {
    if (!contextChar) return true
    if (/\d|[०-९]/.test(contextChar)) return true
    if (/\s/.test(contextChar)) return true
    return false
}