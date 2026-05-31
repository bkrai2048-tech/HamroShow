<script lang="ts">
    import { onMount } from "svelte"
    import { convertRomanizedInsert, transliterateRomanizedText } from "../../utils/nepaliTyping"

    const STORAGE_KEY = "hamroshow:nepaliTypingMode"
    const TOGGLE_SHORTCUT = "Ctrl+Alt+N"

    const vowels = ["a = अ", "A/aa = आ", "i = इ", "I/ii/ee = ई", "u = उ", "U/uu/oo = ऊ", "e = ए", "ai = ऐ", "o = ओ", "au = औ", "aM = अं", "a~ = अँ", "a: = अः", "Ri = ऋ", "RI = ॠ"]
    const special = ["NG / ng = ङ", "NY / yn = ञ", "jn / jna = ज्ञ", "kSh / x = क्ष", "tr = त्र", "rr = र् (half-ra)", "rry = र्य", "Ri = ृ (Matra)"]
    const consonants = [
        ["k = क्", "ka = क", "kh/K = ख्", "kha/Ka = ख"],
        ["g = ग्", "ga = ग", "gh/G = घ्", "gha/Ga = घ"],
        ["ng = ङ्", "nga = ङ", "c = च्", "ca = च"],
        ["ch/C = छ्", "cha/Ca = छ", "j = ज्", "ja = ज"],
        ["jh = झ्", "jha = झ", "yn = ञ्", "yna = ञ"],
        ["T = ट्", "Ta = ट", "Th = ठ", "Tha = ठा"],
        ["D = ड्", "Da = ड", "Dh = ढ्", "Dha = ढ"],
        ["N = ण्", "Na = ण", "t = त्", "ta = त"],
        ["th = थ्", "tha = थ", "d = द्", "da = द"],
        ["dh = ध्", "dha = ध", "n = न्", "na = न"],
        ["p = प्", "pa = प", "ph/f/F = फ्", "pha/fa/Fa = फ"],
        ["b = ब्", "ba = ब", "bh = भ्", "bha = भ"],
        ["m = म्", "ma = म", "y = य्", "ya = य"],
        ["r = र्", "ra = र", "l = ल्", "la = ल"],
        ["w = व्", "wa = व", "sh/S = श्", "sha/Sa = श"],
        ["Sh = ष", "e.g. praShTa = प्रष्ट्", "s = स्", "sa = स"],
        ["h = ह्", "ha = ह", "ks = क्ष्", "ksa = क्ष"],
        ["tr = त्र्", "tra = त्र", "Tr = ट्र्", "Tra = ट्र"],
        ["gy = ग्य्", "gya / gyo = ग्या / ग्यो", "jn = ज्ञ्", "jna = ज्ञ"],
        ["e.g. jnaana = ज्ञान"]
    ]
    const typingExamples = [
        ["k", "क्", "ka", "क"],
        ["kaa/kA", "का", "ki", "कि"],
        ["kI", "की", "ku", "कु"],
        ["kU", "कू", "ke", "के"],
        ["kai", "कै", "ko", "को"],
        ["kau", "कौ", "kaM", "कं"],
        ["ka:", "कः", "kaM~", "कँ"],
        ["laai", "लाइ", "laaI/laaii", "लाई"],
        ["ga'i", "गइ", "gaI/ga'I", "गई"]
    ]
    const matraExamples = ["gRi → गृ (ृ matra)", "gri → ग्रि (conjunct)", "gRiha → गृह", "saamaagree → सामाग्री", "kRipaa → कृपा", "vikree → विक्री", "mRityu → मृत्यु", "Ri (standalone) → ऋ"]
    const punctuation = [". → । (full stop)", "| → । (full stop)", ".. → . (literal dot)", "/ → /", "0-9 → ०-९", "लेवी ९:१० keeps : for Bible references"]
    const wordExamples = ["gurung → गुरुङ", "angka → अङ्क", "angga → अङ्ग्", "anggrejI → अङ्ग्रेजी", "nepaalI → नेपाली", "haamro → हाम्रो", "laai → लाइ", "gaI → गई", "gyo → ग्यो", "vidyaalaya → विद्यालय", "jnaana → ज्ञान", "gRihiNI → गृहिणी", "kRipaa → कृपा"]

    let enabled = false
    let tipsOpen = false
    $: tipText = `${TOGGLE_SHORTCUT}: switch English/Nepali typing. Open ? for the full Nepali typing guide.`

    onMount(() => {
        enabled = window.localStorage.getItem(STORAGE_KEY) === "ne"

        const keydown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && tipsOpen) {
                tipsOpen = false
                return
            }

            if (!event.ctrlKey || !event.altKey || event.key.toLowerCase() !== "n") return
            event.preventDefault()
            toggle()
        }

        const beforeInput = (event: InputEvent) => {
            if (!enabled || event.defaultPrevented || event.isComposing) return
            if (!event.inputType?.startsWith("insert") || !event.data) return

            const target = event.target
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
                handleTextControl(event, target)
                return
            }

            if (target instanceof HTMLElement && target.isContentEditable) {
                handleEditable(event, target)
            }
        }

        window.addEventListener("keydown", keydown, true)
        window.addEventListener("beforeinput", beforeInput, true)
        return () => {
            window.removeEventListener("keydown", keydown, true)
            window.removeEventListener("beforeinput", beforeInput, true)
        }
    })

    function toggle() {
        enabled = !enabled
        window.localStorage.setItem(STORAGE_KEY, enabled ? "ne" : "en")
    }

    function handleTextControl(event: InputEvent, target: HTMLInputElement | HTMLTextAreaElement) {
        if (!isTextControl(target)) return

        const start = target.selectionStart ?? target.value.length
        const end = target.selectionEnd ?? start
        const result = convertRomanizedInsert(target.value, start, end, event.data || "")

        event.preventDefault()
        target.value = result.value
        target.setSelectionRange(result.cursor, result.cursor)
        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: event.inputType, data: event.data || "" }))
    }

    function handleEditable(event: InputEvent, target: HTMLElement) {
        const selection = window.getSelection()
        if (!selection?.rangeCount) return

        const range = selection.getRangeAt(0)
        if (!target.contains(range.commonAncestorContainer)) return

        const textNode = range.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer as Text) : null
        if (!textNode || !range.collapsed || range.startOffset !== range.endOffset) {
            event.preventDefault()
            document.execCommand("insertText", false, transliterateRomanizedText(event.data || ""))
            target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: event.inputType, data: event.data || "" }))
            return
        }

        const result = convertRomanizedInsert(textNode.data, range.startOffset, range.endOffset, event.data || "")
        event.preventDefault()
        textNode.data = result.value
        range.setStart(textNode, result.cursor)
        range.collapse(true)
        selection.removeAllRanges()
        selection.addRange(range)
        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: event.inputType, data: event.data || "" }))
    }

    function isTextControl(target: HTMLInputElement | HTMLTextAreaElement) {
        if (target.disabled || target.readOnly) return false
        if (target.closest(".numberInput")) return false
        if (target instanceof HTMLTextAreaElement) return true

        return ["", "text", "search", "email", "tel", "url"].includes(target.type)
    }

    function gridTemplate(columns: number) {
        return `grid-template-columns: repeat(${columns}, minmax(0, 1fr));`
    }
</script>

<div class="nepaliTypingToggle" title={tipText} data-title={tipText}>
    <button class:enabled type="button" class="modeButton" on:click={toggle}>
        <span>{enabled ? "ने" : "EN"}</span>
        <small>{TOGGLE_SHORTCUT}</small>
    </button>
    <button type="button" class="helpButton" on:click={() => (tipsOpen = true)} title="Nepali Typing Tips">?</button>
</div>

{#if tipsOpen}
    <div class="tipsBackdrop" on:click={() => (tipsOpen = false)} role="presentation">
        <section class="tipsModal" on:click|stopPropagation role="dialog" aria-modal="true" aria-label="Nepali Typing Tips">
            <header>
                <h2>Nepali Typing Tips (नेपाली टाइपिंग सुझावहरू)</h2>
                <button type="button" on:click={() => (tipsOpen = false)} title="Close">x</button>
            </header>

            <div class="tipsContent">
                <div class="quickTip">
                    <b>Quick tip</b>
                    <p>Use {TOGGLE_SHORTCUT} to switch English/Nepali typing. For Nepali full stop, type <code>.</code> or <code>|</code> to get <b>।</b>. Type <code>..</code> to insert a literal dot <b>.</b>. Use <code>'</code> between vowels when you need a separate vowel, like <code>ga'i</code> for <b>गइ</b>.</p>
                </div>

                <section class="tipSection">
                    <h3>Vowels (स्वर)</h3>
                    <div class="tipGrid" style={gridTemplate(3)}>{#each vowels as item}<span>{item}</span>{/each}</div>
                </section>

                <section class="tipSection">
                    <h3>Special (विशेष)</h3>
                    <div class="tipGrid" style={gridTemplate(2)}>{#each special as item}<span>{item}</span>{/each}</div>
                </section>

                <section class="tipSection">
                    <h3>Consonants (व्यंजन)</h3>
                    <div class="tipTable consonants">
                        {#each consonants as row}
                            <div class="tipRow" style={`grid-template-columns: repeat(${row.length}, minmax(0, 1fr));`}>
                                {#each row as item}<span>{item}</span>{/each}
                            </div>
                        {/each}
                    </div>
                </section>

                <section class="tipSection">
                    <h3>Typing Examples (टाइपिङ उदाहरण)</h3>
                    <div class="tipTable examples">
                        {#each typingExamples as row}
                            <div class="tipRow four">
                                {#each row as item}<span>{item}</span>{/each}
                            </div>
                        {/each}
                    </div>
                </section>

                <section class="tipSection warm">
                    <h3>ृ Matra (Capital R + i)</h3>
                    <p>Use <code>Ri</code> (capital R) after a consonant for ृ matra. Lowercase <code>ri</code> creates a conjunct, e.g. ग्रि.</p>
                    <div class="tipList">{#each matraExamples as item}<span>{item}</span>{/each}</div>
                </section>

                <section class="tipSection">
                    <h3>Punctuation (विरामचिह्न)</h3>
                    <div class="tipGrid" style={gridTemplate(2)}>{#each punctuation as item}<span>{item}</span>{/each}</div>
                </section>

                <section class="tipSection">
                    <h3>Word Examples (शब्द उदाहरण)</h3>
                    <div class="tipGrid" style={gridTemplate(2)}>{#each wordExamples as item}<span>{item}</span>{/each}</div>
                </section>

                <p class="note">* Note: Changes happen as you type. <code>k</code> gives <b>क्</b>, then <code>a</code> makes it <b>क</b>.</p>
            </div>
        </section>
    </div>
{/if}

<style>
    .nepaliTypingToggle {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 10000;

        display: inline-flex;
        align-items: stretch;
        overflow: hidden;

        border: 1px solid color-mix(in srgb, var(--secondary) 35%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--primary-darkest) 88%, transparent);
        color: var(--text);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
        font: inherit;
        font-weight: 700;
    }

    .modeButton,
    .helpButton {
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
    }

    .modeButton {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 10px;
    }

    .modeButton.enabled {
        background: color-mix(in srgb, var(--secondary) 18%, var(--primary-darkest));
    }

    .modeButton span {
        color: var(--secondary);
        min-width: 24px;
        text-align: center;
    }

    .modeButton small {
        font-size: 0.74em;
        opacity: 0.82;
    }

    .helpButton {
        width: 34px;
        border-left: 1px solid color-mix(in srgb, var(--secondary) 24%, transparent);
        color: var(--secondary);
    }

    .tipsBackdrop {
        position: fixed;
        inset: 0;
        z-index: 10001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.58);
    }

    .tipsModal {
        width: min(780px, 100%);
        max-height: min(82vh, 820px);
        display: flex;
        flex-direction: column;
        border: 1px solid var(--primary-lighter);
        border-radius: 8px;
        background: var(--primary);
        color: var(--text);
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.42);
    }

    .tipsModal header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--primary-lighter);
    }

    .tipsModal h2,
    .tipSection h3 {
        margin: 0;
    }

    .tipsModal h2 {
        font-size: 1.25rem;
    }

    .tipsModal header button {
        border: 0;
        border-radius: 4px;
        background: var(--primary-lighter);
        color: var(--text);
        cursor: pointer;
        padding: 5px 10px;
        font-weight: 800;
    }

    .tipsContent {
        overflow: auto;
        padding: 16px 18px 20px;
    }

    .quickTip,
    .tipSection {
        margin-bottom: 14px;
    }

    .quickTip,
    .tipTable,
    .tipList,
    .warm {
        border-radius: 6px;
        background: color-mix(in srgb, var(--primary-lighter) 55%, transparent);
    }

    .quickTip {
        padding: 12px;
        color: var(--text);
    }

    .quickTip p,
    .warm p,
    .note {
        margin: 6px 0 0;
        line-height: 1.55;
    }

    .tipSection h3 {
        margin-bottom: 8px;
        color: var(--secondary);
        font-size: 1rem;
    }

    .tipGrid,
    .tipList {
        display: grid;
        gap: 6px 14px;
        padding: 10px;
    }

    .tipTable {
        overflow-x: auto;
        padding: 6px 10px;
    }

    .tipRow {
        display: grid;
        gap: 10px;
        border-bottom: 1px solid color-mix(in srgb, var(--primary-light) 55%, transparent);
        padding: 6px 0;
        min-width: 520px;
    }

    .tipRow:last-child {
        border-bottom: 0;
    }

    .tipRow.four {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .examples .tipRow span:nth-child(even) {
        font-weight: 800;
        color: var(--secondary);
    }

    .warm {
        padding: 12px;
    }

    code {
        border-radius: 3px;
        background: var(--primary-darkest);
        padding: 1px 4px;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    }

    .note {
        opacity: 0.82;
        font-size: 0.9rem;
    }

    @media (max-width: 640px) {
        .modeButton small {
            display: none;
        }

        .tipGrid,
        .tipList {
            grid-template-columns: 1fr !important;
        }
    }
</style>