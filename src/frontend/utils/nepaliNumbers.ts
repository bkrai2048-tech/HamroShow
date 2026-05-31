const devanagariDigits = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"]
const asciiDigits: Record<string, string> = {
    "०": "0",
    "१": "1",
    "२": "2",
    "३": "3",
    "४": "4",
    "५": "5",
    "६": "6",
    "७": "7",
    "८": "8",
    "९": "9"
}

export function toDevanagariDigits(value: unknown) {
    return String(value ?? "").replace(/\d/g, (digit) => devanagariDigits[Number(digit)] || digit)
}

export function toAsciiDigits(value: unknown) {
    return String(value ?? "").replace(/[०-९]/g, (digit) => asciiDigits[digit] || digit)
}

export function localizeBibleNumbers(value: unknown, useNepaliNumbers: boolean) {
    const text = String(value ?? "")
    return useNepaliNumbers ? toDevanagariDigits(text) : text
}

export function normalizeBibleReferenceInput(value: string) {
    return toAsciiDigits(value)
        .replace(/[：꞉ː]/g, ":")
        .replace(/[–—−]/g, "-")
}

export function shouldUseNepaliNumbers(...values: unknown[]) {
    const haystack = values.map(stringifyValue).filter(Boolean).join(" ").toLowerCase()

    return /(^|[\s_-])ne($|[\s_-])|nepali|nnrv|नेपाली|उत्पत्ति|प्रस्थान|लेवी|भजन|यूहन्ना/.test(haystack)
}

function stringifyValue(value: unknown): string {
    if (!value) return ""
    if (Array.isArray(value)) return value.map(stringifyValue).join(" ")
    if (typeof value === "object") return Object.values(value as Record<string, unknown>).slice(0, 12).map(stringifyValue).join(" ")
    return String(value)
}