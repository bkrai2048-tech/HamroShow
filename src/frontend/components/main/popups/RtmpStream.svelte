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

    interface CaptureSource {
        id: string
        name: string
        type: "screen" | "window" | "camera"
        section: string
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

    let captureSources: CaptureSource[] = []
    let captureSourceId: string = $special.rtmpCaptureSourceId || ""
    let loadingSources = false

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
    let chunkWatchdog: ReturnType<typeof setTimeout> | null = null
    let sentChunks = 0
    let sentBytes = 0

    $: preset = presets.find((p) => p.id === presetId) || presets[0]
    $: selectedCaptureSource = captureSources.find((source) => captureValue(source) === captureSourceId) || null

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

    async function refreshCaptureSources() {
        loadingSources = true

        try {
            const [screens, windows, outputs] = await Promise.all([
                requestMain(Main.GET_SCREENS),
                requestMain(Main.GET_WINDOWS),
                requestMain(Main.STREAM_LIST_OUTPUTS).catch(() => [])
            ])
            const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
            const cameras = devices.filter((device) => device.kind === "videoinput")

            const outputSourceIds = new Set((outputs || []).map((o: any) => o.sourceId).filter(Boolean))
            const outputEntries = (outputs || [])
                .filter((o: any) => o.sourceId)
                .map((o: any) => ({ id: o.sourceId as string, name: `${o.name} (HamroShow output)`, type: "window" as const, section: "HamroShow outputs" }))

            captureSources = [
                ...outputEntries,
                ...(screens || []).map((source) => ({ id: source.id, name: source.name, type: "screen" as const, section: "Screens" })),
                ...(windows || []).filter((source) => !outputSourceIds.has(source.id)).map((source) => ({ id: source.id, name: source.name, type: "window" as const, section: "Windows" })),
                ...cameras.map((source, index) => ({ id: source.deviceId, name: source.label || `Camera ${index + 1}`, type: "camera" as const, section: "Cameras" }))
            ]

            if (!captureSources.find((source) => captureValue(source) === captureSourceId)) captureSourceId = captureSources[0] ? captureValue(captureSources[0]) : ""
        } finally {
            loadingSources = false
        }
    }

    function captureValue(source: CaptureSource) {
        return `${source.type}:${source.id}`
    }

    function captureTypeLabel(type: CaptureSource["type"]) {
        if (type === "screen") return "Screen"
        if (type === "window") return "Window"
        return "Camera"
    }

    async function getCaptureStream(source: CaptureSource): Promise<MediaStream> {
        if (source.type === "camera") {
            return await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: source.id }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
                audio: false
            })
        }

        const constraints: any = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: source.id,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 30
                }
            }
        }

        return await navigator.mediaDevices.getUserMedia(constraints)
    }

    function pickMimeType(): string {
        const candidates = [
            "video/webm;codecs=vp8",
            "video/webm;codecs=vp9",
            "video/webm;codecs=h264",
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
        if (!selectedCaptureSource) {
            await refreshCaptureSources()
            if (!selectedCaptureSource) {
                statusMsg = "No capture source found. Click Refresh and select a screen, window, or camera."
                statusKind = "error"
                return
            }
        }

        starting = true
        statusMsg = `Opening ${captureTypeLabel(selectedCaptureSource.type).toLowerCase()} capture…`
        statusKind = "info"

        try {
            mediaStream = await getCaptureStream(selectedCaptureSource)
        } catch (err: any) {
            starting = false
            statusMsg = `Could not capture ${selectedCaptureSource.name}: ${err?.message || err}`
            statusKind = "error"
            return
        }

        // Persist URL + preset + source selection (NOT the stream key)
        special.update((s) => ({ ...s, rtmpUrl, rtmpPreset: presetId, rtmpCaptureSourceId: captureSourceId }))

        const fullUrl = joinUrlAndKey(rtmpUrl, streamKey)
        const mimeType = pickMimeType()
        sentChunks = 0
        sentBytes = 0

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
            recorder = new MediaRecorder(mediaStream, { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 160_000 })
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
            sentChunks += 1
            sentBytes += ev.data.size
            if (sentChunks === 1) {
                statusMsg = "Capture data reached FFmpeg. Waiting for Facebook to accept the stream..."
                statusKind = "info"
            }
            sendMain(Main.STREAM_DATA, buf)
        }

        recorder.onerror = (ev: any) => {
            stopStreaming(`Recorder error: ${ev?.error?.message || "unknown"}`, "error")
        }

        // Stop streaming automatically if user ends share via the OS picker
        mediaStream.getVideoTracks().forEach((t) => {
            t.onended = () => stopStreaming("Capture source ended.", "info")
        })

        recorder.start(250) // emit chunks every 250ms for lower latency

        streaming = true
        starting = false
        startedAt = Date.now()
        elapsed = "00:00"
        elapsedTimer = setInterval(tickElapsed, 1000)
        statusMsg = "Sending capture data to FFmpeg..."
        statusKind = "info"

        chunkWatchdog = setTimeout(() => {
            if (!streaming || sentChunks > 0) return
            stopStreaming("Capture opened, but no video data was produced. Try Refresh and choose a different screen/window source.", "error")
        }, 7000)
    }

    function joinUrlAndKey(url: string, key: string) {
        const cleanUrl = url.trim().replace(/\/+$/, "")
        const cleanKey = key.trim().replace(/^\/+/, "")
        return `${cleanUrl}/${cleanKey}`
    }

    function stopStreaming(finalMessage = "Stream stopped.", finalKind: "info" | "error" = "info") {
        const wasActive = streaming || starting
        starting = false
        if (recorder && recorder.state !== "inactive") {
            try { recorder.stop() } catch { /* */ }
        }
        sendMain(Main.STREAM_STOP)
        cleanupStream()
        if (elapsedTimer) {
            clearInterval(elapsedTimer)
            elapsedTimer = null
        }
        if (wasActive) {
            streaming = false
            statusMsg = finalMessage
            statusKind = finalKind
        }
    }

    function cleanupStream() {
        if (chunkWatchdog) {
            clearTimeout(chunkWatchdog)
            chunkWatchdog = null
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach((t) => t.stop())
            mediaStream = null
        }
        recorder = null
    }

    onMount(() => {
        detectFfmpeg()
        refreshCaptureSources()
        statusListenerId = receiveMain(Main.STREAM_STATUS, (payload: any) => {
            if (!payload) return
            if (payload.state === "error") {
                stopStreaming(payload.message || "Stream error.", "error")
            } else if (payload.state === "live") {
                if (payload.message) {
                    statusMsg = payload.message
                    statusKind = "info"
                }
            } else if (payload.state === "starting") {
                statusMsg = "Connecting to RTMP server..."
                statusKind = "info"
            } else if (payload.state === "stopped") {
                if (streaming) stopStreaming(payload.message || "Stream stopped.", "info")
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
        <label for="capture-source">Capture source</label>
        <div class="source-row">
            <select id="capture-source" bind:value={captureSourceId} disabled={streaming || starting || loadingSources}>
                {#if !captureSources.length}
                    <option value="">No capture sources found</option>
                {:else}
                    {#each captureSources as source (captureValue(source))}
                        <option value={captureValue(source)}>{captureTypeLabel(source.type)}: {source.name}</option>
                    {/each}
                {/if}
            </select>
            <MaterialButton variant="outlined" disabled={streaming || starting || loadingSources} on:click={refreshCaptureSources}>
                <Icon id="reset" white /> <span>{loadingSources ? "Loading" : "Refresh"}</span>
            </MaterialButton>
        </div>
        <p class="hint">Choose the screen, window, or camera HamroShow should send to Facebook. To broadcast the Audience display, open it as a window (top-right output toggle) and pick "Audience (HamroShow output)".</p>
    </div>

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
    .field input,
    .field select {
        padding: 8px 10px;
        background: var(--primary-darker);
        border: 1px solid var(--secondary-opacity);
        color: var(--text);
        border-radius: 4px;
        font-size: 0.95em;
        font-family: inherit;
    }
    .field input:disabled,
    .field select:disabled {
        opacity: 0.6;
    }
    .source-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: stretch;
    }
    .source-row :global(button) {
        height: 100%;
        white-space: nowrap;
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
