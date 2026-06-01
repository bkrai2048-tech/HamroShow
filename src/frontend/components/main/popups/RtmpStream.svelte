<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { MAIN, Main } from "../../../../types/IPC/Main"
    import { receiveMain, requestMain, sendMain } from "../../../IPC/main"
    import { activePopup, special } from "../../../stores"
    import Icon from "../../helpers/Icon.svelte"
    import MaterialButton from "../../inputs/MaterialButton.svelte"

    interface Preset {
        id: string
        label: string
        url: string
        help?: string
    }

    const presets: Preset[] = [
        { id: "youtube", label: "YouTube Live", url: "rtmp://a.rtmp.youtube.com/live2", help: "Get your stream key from YouTube Studio → Go Live." },
        { id: "facebook", label: "Facebook Live", url: "rtmps://live-api-s.facebook.com:443/rtmp", help: "Get your stream key from facebook.com/live/producer." },
        { id: "twitch", label: "Twitch", url: "rtmp://live.twitch.tv/app", help: "Get your stream key from dashboard.twitch.tv/settings/stream." },
        { id: "custom", label: "Custom server", url: "" }
    ]

    let ffmpegAvailable: boolean | null = null
    let ffmpegPath = ""
    let ffmpegVersion = ""

    let presetId: string = $special.rtmpPreset || "youtube"
    let rtmpUrl: string = $special.rtmpUrl || presets[0].url
    let streamKey = ""

    let streaming = false
    let starting = false
    let statusMsg = ""
    let statusKind: "info" | "error" = "info"
    let startedAt = 0
    let elapsed = "00:00"
    let elapsedTimer: ReturnType<typeof setInterval> | null = null

    let mediaStream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let statusListenerId: string | null = null

    $: preset = presets.find((p) => p.id === presetId) || presets[0]

    function selectPreset(id: string) {
        presetId = id
        const p = presets.find((x) => x.id === id)
        if (p && p.id !== "custom") rtmpUrl = p.url
    }

    function pad(n: number) {
        return n.toString().padStart(2, "0")
    }

    function tickElapsed() {
        const s = Math.floor((Date.now() - startedAt) / 1000)
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        const sec = s % 60
        elapsed = h ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
    }

    async function detectFfmpeg() {
        statusMsg = "Checking for FFmpeg…"
        statusKind = "info"
        const result = await requestMain(Main.STREAM_CHECK_FFMPEG)
        if (!result) {
            ffmpegAvailable = false
            statusMsg = "Could not check for FFmpeg."
            statusKind = "error"
            return
        }
        ffmpegAvailable = !!result.available
        ffmpegPath = result.path || ""
        ffmpegVersion = result.version || ""
        if (!ffmpegAvailable) {
            statusMsg = "FFmpeg not found on PATH. Install FFmpeg and restart HamroShow."
            statusKind = "error"
        } else {
            statusMsg = ""
        }
    }

    async function getCaptureStream(): Promise<MediaStream> {
        // Let user pick a screen/window via the browser picker. Audio = true requests system audio (where supported).
        // @ts-ignore — getDisplayMedia exists in Electron 30+
        return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
    }

    function pickMimeType(): string {
        const candidates = [
            "video/webm;codecs=vp8,opus",
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=h264,opus",
            "video/webm"
        ]
        for (const c of candidates) {
            if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c
        }
        return "video/webm"
    }

    async function startStreaming() {
        if (streaming || starting) return
        if (!rtmpUrl.trim()) {
            statusMsg = "Enter an RTMP server URL."
            statusKind = "error"
            return
        }
        if (!streamKey.trim()) {
            statusMsg = "Enter your stream key."
            statusKind = "error"
            return
        }
        if (ffmpegAvailable !== true) {
            await detectFfmpeg()
            if (ffmpegAvailable !== true) return
        }

        starting = true
        statusMsg = "Requesting capture source…"
        statusKind = "info"

        try {
            mediaStream = await getCaptureStream()
        } catch (err: any) {
            starting = false
            statusMsg = `Capture cancelled: ${err?.message || err}`
            statusKind = "error"
            return
        }

        // Persist URL + preset (NOT the stream key)
        special.update((s) => ({ ...s, rtmpUrl, rtmpPreset: presetId }))

        const fullUrl = joinUrlAndKey(rtmpUrl, streamKey)
        const mimeType = pickMimeType()

        statusMsg = "Starting FFmpeg…"
        const startResult = await requestMain(Main.STREAM_START, { rtmpUrl: fullUrl, mimeType })
        if (!startResult?.started) {
            starting = false
            statusMsg = startResult?.error || "Failed to start stream."
            statusKind = "error"
            cleanupStream()
            return
        }

        try {
            recorder = new MediaRecorder(mediaStream, { mimeType, videoBitsPerSecond: 3_500_000, audioBitsPerSecond: 128_000 })
        } catch (err: any) {
            statusMsg = `MediaRecorder failed: ${err?.message || err}`
            statusKind = "error"
            sendMain(Main.STREAM_STOP)
            cleanupStream()
            starting = false
            return
        }

        recorder.ondataavailable = async (ev) => {
            if (!ev.data || ev.data.size === 0) return
            const buf = await ev.data.arrayBuffer()
            sendMain(Main.STREAM_DATA, buf)
        }

        recorder.onerror = (ev: any) => {
            statusMsg = `Recorder error: ${ev?.error?.message || "unknown"}`
            statusKind = "error"
            stopStreaming()
        }

        // Stop streaming automatically if user ends share via the OS picker
        mediaStream.getVideoTracks().forEach((t) => {
            t.onended = () => stopStreaming()
        })

        recorder.start(500) // emit chunks every 500ms

        streaming = true
        starting = false
        startedAt = Date.now()
        elapsed = "00:00"
        elapsedTimer = setInterval(tickElapsed, 1000)
        statusMsg = "Live"
        statusKind = "info"
    }

    function joinUrlAndKey(url: string, key: string) {
        const cleanUrl = url.trim().replace(/\/+$/, "")
        const cleanKey = key.trim().replace(/^\/+/, "")
        return `${cleanUrl}/${cleanKey}`
    }

    function stopStreaming() {
        if (recorder && recorder.state !== "inactive") {
            try { recorder.stop() } catch { /* */ }
        }
        sendMain(Main.STREAM_STOP)
        cleanupStream()
        if (elapsedTimer) {
            clearInterval(elapsedTimer)
            elapsedTimer = null
        }
        if (streaming) {
            streaming = false
            statusMsg = "Stream stopped."
            statusKind = "info"
        }
    }

    function cleanupStream() {
        if (mediaStream) {
            mediaStream.getTracks().forEach((t) => t.stop())
            mediaStream = null
        }
        recorder = null
    }

    onMount(() => {
        detectFfmpeg()
        statusListenerId = receiveMain(Main.STREAM_STATUS, (payload: any) => {
            if (!payload) return
            if (payload.state === "error") {
                statusMsg = payload.message || "Stream error."
                statusKind = "error"
                stopStreaming()
            } else if (payload.state === "stopped") {
                if (streaming) stopStreaming()
            }
        })
    })

    onDestroy(() => {
        if (statusListenerId) {
            try { window.api.removeListener(MAIN, statusListenerId) } catch { /* */ }
        }
        if (streaming) stopStreaming()
        else cleanupStream()
        if (elapsedTimer) clearInterval(elapsedTimer)
    })

    function close() {
        if (streaming) {
            const ok = confirm("Stop the live stream and close this window?")
            if (!ok) return
            stopStreaming()
        }
        activePopup.set(null)
    }
</script>

<div class="rtmp">
    <h2 class="title"><Icon id="stage" size={1.4} white /> <span>Stream to RTMP</span></h2>

    {#if ffmpegAvailable === false}
        <div class="banner error">
            <strong>FFmpeg is not installed (or not on PATH).</strong>
            <p>HamroShow's built-in streamer requires the system FFmpeg binary.</p>
            <ol>
                <li>Download FFmpeg from <a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener">ffmpeg.org/download.html</a> (on Windows the <em>gyan.dev</em> "release essentials" build is easiest).</li>
                <li>Extract it and add the <code>bin</code> folder to your <strong>system PATH</strong>.</li>
                <li>Restart HamroShow and reopen this window.</li>
            </ol>
            <MaterialButton variant="outlined" on:click={detectFfmpeg}>
                <Icon id="reset" white /> <span>Re-check</span>
            </MaterialButton>
        </div>
    {:else if ffmpegAvailable === true}
        <div class="banner info small">
            FFmpeg detected{ffmpegVersion ? `: ${ffmpegVersion}` : ""}.
        </div>
    {/if}

    <div class="field">
        <label>Platform</label>
        <div class="preset-row">
            {#each presets as p}
                <button class="preset" class:active={p.id === presetId} on:click={() => selectPreset(p.id)} disabled={streaming || starting}>
                    {p.label}
                </button>
            {/each}
        </div>
        {#if preset.help}
            <p class="hint">{preset.help}</p>
        {/if}
    </div>

    <div class="field">
        <label for="rtmp-url">RTMP server URL</label>
        <input id="rtmp-url" type="text" bind:value={rtmpUrl} placeholder="rtmp://your-server/app" disabled={streaming || starting || (preset.id !== "custom")} spellcheck="false" />
    </div>

    <div class="field">
        <label for="rtmp-key">Stream key</label>
        <input id="rtmp-key" type="password" bind:value={streamKey} placeholder="Paste your stream key" disabled={streaming || starting} autocomplete="off" />
        <p class="hint">Your stream key is never saved.</p>
    </div>

    {#if streaming}
        <div class="live-row">
            <span class="dot" /> <span class="live">LIVE</span> <span class="elapsed">{elapsed}</span>
        </div>
    {/if}

    {#if statusMsg}
        <div class="banner {statusKind === 'error' ? 'error' : 'info'}">{statusMsg}</div>
    {/if}

    <div class="actions">
        <MaterialButton variant="outlined" on:click={close}>
            <Icon id="close" white /> <span>Close</span>
        </MaterialButton>
        {#if streaming}
            <MaterialButton variant="contained" red on:click={stopStreaming}>
                <Icon id="stop" white /> <span>Stop streaming</span>
            </MaterialButton>
        {:else}
            <MaterialButton variant="contained" disabled={starting || ffmpegAvailable !== true} on:click={startStreaming}>
                <Icon id="play" white /> <span>{starting ? "Starting…" : "Start streaming"}</span>
            </MaterialButton>
        {/if}
    </div>
</div>

<style>
    .rtmp {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 480px;
        max-width: 600px;
    }
    .title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.3em;
        margin: 0 0 4px;
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .field label {
        font-size: 0.85em;
        opacity: 0.8;
    }
    .field input {
        padding: 8px 10px;
        background: var(--primary-darker);
        border: 1px solid var(--secondary-opacity);
        color: var(--text);
        border-radius: 4px;
        font-size: 0.95em;
        font-family: inherit;
    }
    .field input:disabled {
        opacity: 0.6;
    }
    .preset-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .preset {
        flex: 1 1 auto;
        min-width: 110px;
        padding: 8px 10px;
        background: var(--primary-darker);
        color: var(--text);
        border: 1px solid var(--secondary-opacity);
        border-radius: 4px;
        cursor: pointer;
        font: inherit;
    }
    .preset:hover:not(:disabled) {
        background: var(--hover);
    }
    .preset.active {
        background: var(--secondary);
        color: var(--secondary-text);
        border-color: var(--secondary);
    }
    .preset:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .hint {
        font-size: 0.8em;
        opacity: 0.65;
        margin: 0;
    }
    .banner {
        padding: 10px 12px;
        border-radius: 4px;
        font-size: 0.9em;
        line-height: 1.4;
    }
    .banner.small {
        padding: 6px 10px;
        font-size: 0.82em;
        opacity: 0.75;
    }
    .banner.info {
        background: var(--primary-darker);
        border: 1px solid var(--secondary-opacity);
    }
    .banner.error {
        background: rgba(229, 57, 53, 0.12);
        border: 1px solid rgba(229, 57, 53, 0.5);
        color: var(--text);
    }
    .banner ol {
        margin: 8px 0 10px 18px;
        padding: 0;
    }
    .banner li {
        margin: 4px 0;
    }
    .banner code {
        background: rgba(255, 255, 255, 0.08);
        padding: 1px 5px;
        border-radius: 3px;
    }
    .banner a {
        color: var(--secondary);
    }
    .live-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 1.05em;
        padding: 6px 0;
    }
    .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #e53935;
        box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.6);
        animation: pulse 1.6s infinite;
    }
    .live {
        color: #e53935;
        font-weight: bold;
        letter-spacing: 1px;
    }
    .elapsed {
        font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace;
        opacity: 0.85;
    }
    @keyframes pulse {
        0%   { box-shadow: 0 0 0 0   rgba(229, 57, 53, 0.6); }
        70%  { box-shadow: 0 0 0 10px rgba(229, 57, 53, 0); }
        100% { box-shadow: 0 0 0 0   rgba(229, 57, 53, 0); }
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
    }
</style>
