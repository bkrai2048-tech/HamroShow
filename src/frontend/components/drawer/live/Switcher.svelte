<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { uid } from "uid"
    import { BLACKMAGIC, NDI } from "../../../../types/Channels"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import { type CameraData, cameraManager } from "../../../media/cameraManager"
    import { activeDrawerTab, activePopup, activeRecording, outLocked, outputs, playerVideos, special } from "../../../stores"
    import { destroy, receive, send } from "../../../utils/request"
    import Icon from "../../helpers/Icon.svelte"
    import { getFirstActiveOutput, setOutput } from "../../helpers/output"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import MaterialTextInput from "../../inputs/MaterialTextInput.svelte"
    import Loader from "../../main/Loader.svelte"
    import { clearBackground } from "../../output/clear"
    import Center from "../../system/Center.svelte"
    import SelectElem from "../../system/SelectElem.svelte"
    import Card from "../Card.svelte"
    import BmdStream from "./BMDStream.svelte"
    import Cam from "./Cam.svelte"
    import Capture from "./Capture.svelte"
    import NDIStream from "./NDIStream.svelte"
    import { stopMediaRecorder } from "./recorder"

    export let searchValue = ""
    export let streams: MediaStream[] = []

    type SourceType = "camera" | "screen" | "ndi" | "blackmagic" | "web"

    interface SwitcherSource {
        id: string
        name: string
        section: string
        type: SourceType
        icon: string
        cameraGroup?: string
        screen?: { id: string; name: string }
        data?: any
        url?: string
        payload: any
    }

    interface SourceSection {
        id: string
        title: string
        icon: string
        loading: boolean
        sources: SwitcherSource[]
    }

    let cameras: CameraData[] = []
    let screens: { name: string; id: string }[] = []
    let windows: { name: string; id: string }[] = []
    let ndiSources: { name: string; id: string }[] = []
    let blackmagicSources: { name: string; id: string; data?: any }[] = []

    let loadingLocal = true
    let loadingNdi = true
    let loadingBlackmagic = true
    let previewSource: SwitcherSource | null = null
    let webUrl = ""
    let webName = ""
    let webUrlError = ""

    const NDI_RECEIVER_ID = "LIVE_SWITCHER_NDI"
    const BLACKMAGIC_RECEIVER_ID = "LIVE_SWITCHER_BLACKMAGIC"

    const receiveNDI = {
        RECEIVE_LIST: (msg: string) => {
            loadingNdi = false
            ndiSources = parseList(msg).map(({ name, urlAddress, id }: any) => ({ name, id: urlAddress || id }))
        }
    }

    const receiveBlackmagic = {
        GET_DEVICES: (msg: string) => {
            loadingBlackmagic = false
            blackmagicSources = parseList(msg).map((device: any) => ({
                id: device.deviceHandle,
                name: device.displayName || device.modelName || "Blackmagic",
                data: { displayModes: device.inputDisplayModes }
            }))
        }
    }

    onMount(() => {
        receive(NDI, receiveNDI, NDI_RECEIVER_ID)
        receive(BLACKMAGIC, receiveBlackmagic, BLACKMAGIC_RECEIVER_ID)
        refreshAll(false)
    })

    onDestroy(() => {
        destroy(NDI, NDI_RECEIVER_ID)
        destroy(BLACKMAGIC, BLACKMAGIC_RECEIVER_ID)
    })

    $: groups = $special?.ndiInputGroups || ""
    $: currentOutput = getFirstActiveOutput($outputs)
    $: programBackground = currentOutput?.out?.background || null

    $: cameraSources = cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        section: "Cameras",
        type: "camera" as SourceType,
        icon: "camera",
        cameraGroup: camera.group,
        payload: { name: camera.name, id: camera.id, cameraGroup: camera.group, type: "camera" }
    }))

    $: screenSources = screens.map((screen) => ({
        id: screen.id,
        name: screen.name,
        section: "Screens",
        type: "screen" as SourceType,
        icon: "screen",
        screen,
        payload: { id: screen.id, name: screen.name, type: "screen" }
    }))

    $: windowSources = windows.map((windowSource) => ({
        id: windowSource.id,
        name: windowSource.name,
        section: "Windows",
        type: "screen" as SourceType,
        icon: "window",
        screen: windowSource,
        payload: { id: windowSource.id, name: windowSource.name, type: "screen" }
    }))

    $: ndiSwitcherSources = ndiSources.map((source) => ({
        id: source.id,
        name: source.name,
        section: "NDI",
        type: "ndi" as SourceType,
        icon: "ndi",
        payload: { id: source.id, name: source.name, type: "ndi" }
    }))

    $: blackmagicSwitcherSources = blackmagicSources.map((source) => ({
        id: source.id,
        name: source.name,
        section: "Blackmagic",
        type: "blackmagic" as SourceType,
        icon: "blackmagic",
        data: source.data,
        payload: { id: source.id, name: source.name, type: "blackmagic" }
    }))

    $: webSwitcherSources = Object.entries($playerVideos)
        .filter(([, video]) => video.type === "web")
        .map(([id, video]) => createWebSource(id, video))
        .filter(Boolean) as SwitcherSource[]

    $: cameraSwitcherSources = sortByName([...cameraSources, ...webSwitcherSources])

    $: sourceSections = [
        { id: "cameras", title: "Cameras", icon: "camera", loading: loadingLocal, sources: cameraSwitcherSources.filter(matchesSearch) },
        { id: "screens", title: "Screens", icon: "screen", loading: loadingLocal, sources: screenSources.filter(matchesSearch) },
        { id: "windows", title: "Windows", icon: "window", loading: loadingLocal, sources: windowSources.filter(matchesSearch) },
        { id: "ndi", title: "NDI", icon: "ndi", loading: loadingNdi, sources: ndiSwitcherSources.filter(matchesSearch) },
        { id: "blackmagic", title: "Blackmagic", icon: "blackmagic", loading: loadingBlackmagic, sources: blackmagicSwitcherSources.filter(matchesSearch) }
    ] as SourceSection[]

    $: visibleSections = sourceSections.filter((section) => section.sources.length || section.loading)
    $: allSources = sourceSections.flatMap((section) => section.sources)
    $: visibleSourceCount = visibleSections.reduce((count, section) => count + section.sources.length, 0)
    $: anyLoading = loadingLocal || loadingNdi || loadingBlackmagic
    $: programSource = allSources.find((source) => sourceKey(source) === backgroundKey(programBackground)) || null
    $: if (previewSource && allSources.length && !allSources.find((source) => sourceKey(source) === sourceKey(previewSource))) previewSource = null

    async function refreshAll(forceCameras = true) {
        await Promise.all([refreshLocalSources(forceCameras), refreshNdiSources(), refreshBlackmagicSources()])
    }

    async function refreshLocalSources(forceCameras = true) {
        loadingLocal = true

        try {
            const [cameraList, screenList, windowList] = await Promise.all([forceCameras ? cameraManager.refreshCameraList() : cameraManager.getCamerasList(), requestMain(Main.GET_SCREENS), requestMain(Main.GET_WINDOWS)])
            cameras = sortByName(cameraList || [])
            screens = sortByName(screenList || [])
            windows = sortByName(windowList || [])
        } finally {
            loadingLocal = false
        }
    }

    async function refreshNdiSources() {
        loadingNdi = true
        ndiSources = []
        send(NDI, ["RECEIVE_LIST"], { groups })
    }

    async function refreshBlackmagicSources() {
        loadingBlackmagic = true
        blackmagicSources = []
        send(BLACKMAGIC, ["GET_DEVICES"])
    }

    function selectPreview(source: SwitcherSource, event?: any) {
        if ($outLocked) return

        const originalEvent = event?.detail?.event || event?.detail || event
        if (originalEvent?.ctrlKey || originalEvent?.metaKey) {
            takeSource(source)
            return
        }

        previewSource = source
    }

    function takeSource(source: SwitcherSource | null = previewSource) {
        if ($outLocked || !source) return
        setOutput("background", source.payload)
        previewSource = source
    }

    function clearProgram() {
        if ($outLocked || !programBackground) return
        clearBackground()
    }

    function buildRecordingConstraints(source: SwitcherSource | null) {
        if (!source) return null
        if (source.type === "camera") {
            return { video: { deviceId: { exact: source.id } }, audio: false }
        }
        if (source.type === "screen") {
            return {
                video: {
                    mandatory: {
                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: source.id,
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxFrameRate: 60
                    }
                }
            }
        }
        return null
    }

    $: recordSource = previewSource || programSource
    $: recordConstraints = buildRecordingConstraints(recordSource)
    $: isRecording = !!$activeRecording

    function toggleRecord() {
        if (isRecording) {
            stopMediaRecorder()
            return
        }
        if (!recordConstraints) return
        activeRecording.set(recordConstraints)
    }

    function openObsTab() {
        activeDrawerTab.set("obs")
    }

    function openRtmpStream() {
        activePopup.set("rtmp_stream")
    }

    function matchesSearch(source: SwitcherSource) {
        const search = normalize(searchValue)
        if (!search) return true

        return normalize(source.name).includes(search) || normalize(source.section).includes(search) || normalize(source.type).includes(search) || normalize(source.url).includes(search)
    }

    function normalize(value = "") {
        return value.toLowerCase().replace(/[.,\/#!?$%\^&\*;:{}=\-_`~() ]/g, "")
    }

    function sortByName<T extends { name: string }>(items: T[]) {
        return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
    }

    function parseList(msg: string) {
        try {
            const parsed = JSON.parse(msg || "[]")
            return Array.isArray(parsed) ? parsed : []
        } catch (err) {
            console.error("Could not read live source list", err)
            return []
        }
    }

    function sourceKey(source: SwitcherSource | null | undefined) {
        if (!source) return ""
        return `${source.type === "web" ? "player" : source.type}:${source.id}`
    }

    function backgroundKey(background: any) {
        if (!background) return ""
        return `${background.type || ""}:${background.id || background.path || ""}`
    }

    function sourceLabel(source: SwitcherSource | null) {
        if (!source) return "No source selected"
        return `${source.section}: ${source.name}`
    }

    function programLabel() {
        if (programSource) return sourceLabel(programSource)
        if (!programBackground) return "No live source"
        return `${programBackground.name || programBackground.title || programBackground.id || programBackground.path || "Unknown source"}`
    }

    function isPreview(source: SwitcherSource) {
        return sourceKey(source) === sourceKey(previewSource)
    }

    function isProgram(source: SwitcherSource) {
        return sourceKey(source) === backgroundKey(programBackground)
    }

    function createWebSource(id: string, video: any): SwitcherSource | null {
        if (!video?.id) return null

        return {
            id,
            name: video.name || getWebSourceName(video.id),
            section: "Cameras",
            type: "web",
            icon: "input",
            url: video.id,
            payload: { id, type: "player", muted: false, loop: false, startAt: 0, ignoreLayer: true }
        }
    }

    function addWebSource() {
        webUrlError = ""
        const url = normalizeWebUrl(webUrl)

        if (!url) {
            webUrlError = "Enter a valid VDO.Ninja view URL"
            return
        }

        const existing = Object.entries($playerVideos).find(([, video]) => video.type === "web" && video.id === url)
        const id = existing?.[0] || uid()
        const sourceName = webName.trim() || getWebSourceName(url)

        playerVideos.update((videos) => {
            videos[id] = { ...(videos[id] || {}), id: url, name: sourceName, type: "web" }
            return videos
        })

        previewSource = createWebSource(id, { id: url, name: sourceName, type: "web" })
        webUrl = ""
        webName = ""
    }

    function normalizeWebUrl(value: string) {
        value = value.trim()
        if (!value) return ""

        if (!value.includes("://")) value = "https://" + value

        try {
            const parsedUrl = new URL(value)
            if (!["http:", "https:"].includes(parsedUrl.protocol)) return ""
            return parsedUrl.toString()
        } catch (err) {
            return ""
        }
    }

    function getWebSourceName(url: string) {
        try {
            const parsedUrl = new URL(url)
            const host = parsedUrl.hostname.replace("www.", "")
            const viewId = parsedUrl.searchParams.get("view") || parsedUrl.searchParams.get("scene") || parsedUrl.searchParams.get("room") || ""

            if (host.includes("vdo.ninja")) return viewId ? `VDO.Ninja ${viewId}` : "VDO.Ninja Camera"
            return host
        } catch {
            return "Web Camera"
        }
    }

    function formatWebUrl(url = "") {
        try {
            const parsedUrl = new URL(url)
            const viewId = parsedUrl.searchParams.get("view") || parsedUrl.searchParams.get("scene") || parsedUrl.searchParams.get("room")
            if (viewId) return `${parsedUrl.hostname.replace("www.", "")}/?view=${viewId}`
            return parsedUrl.hostname.replace("www.", "")
        } catch {
            return url
        }
    }
</script>

<div class="switcher">
    <div class="control-strip">
        <div class="status-card program">
            <div class="status-label">
                <span class="status-dot"></span>
                Program
            </div>
            <div class="status-name" title={programLabel()}>{programLabel()}</div>
        </div>

        <div class="status-card preview">
            <div class="status-label">
                <Icon id={previewSource?.icon || "input"} size={0.9} white />
                Preview
            </div>
            <div class="status-name" title={sourceLabel(previewSource)}>{sourceLabel(previewSource)}</div>
        </div>

        <div class="switcher-actions">
            <MaterialButton variant="outlined" title="Refresh live sources" disabled={anyLoading} on:click={() => refreshAll(true)}>
                <Icon id="reset" white />
                <span>Refresh</span>
            </MaterialButton>
            <MaterialButton variant="outlined" title="Stream via OBS Studio" on:click={openObsTab}>
                <Icon id="stage" white />
                <span>OBS</span>
            </MaterialButton>
            <MaterialButton variant="outlined" title="Stream directly to YouTube / Facebook / Twitch / custom RTMP" on:click={openRtmpStream}>
                <Icon id="stage" white />
                <span>RTMP</span>
            </MaterialButton>
            <MaterialButton variant={isRecording ? "contained" : "outlined"} title={isRecording ? "Stop recording" : recordConstraints ? `Record ${recordSource?.name || "source"}` : "Select a camera or screen in Preview to record"} disabled={!isRecording && !recordConstraints} red={isRecording} on:click={toggleRecord}>
                <Icon id={isRecording ? "stop" : "record"} white />
                <span>{isRecording ? "Stop" : "Record"}</span>
            </MaterialButton>
            <MaterialButton variant="outlined" title="Clear program" disabled={!programBackground || $outLocked} red on:click={clearProgram}>
                <Icon id="clear" white />
                <span>Clear</span>
            </MaterialButton>
            <MaterialButton variant="contained" title="Send preview to program" disabled={!previewSource || $outLocked} on:click={() => takeSource()}>
                <Icon id="play" white />
                <span>Cut</span>
            </MaterialButton>
        </div>
    </div>

    <div class="web-url-panel">
        <MaterialTextInput label="VDO.Ninja camera URL" value={webUrl} placeholder="https://vdo.ninja/?view=your-camera" pasteBtn on:input={(e) => (webUrl = e.detail)} on:change={(e) => (webUrl = e.detail)} on:keydown={(e) => e.key === "Enter" && addWebSource()} />
        <MaterialTextInput label="Name" value={webName} placeholder="Camera 1" on:input={(e) => (webName = e.detail)} on:change={(e) => (webName = e.detail)} on:keydown={(e) => e.key === "Enter" && addWebSource()} />
        <MaterialButton variant="contained" disabled={!webUrl.trim() || $outLocked} title="Add VDO.Ninja source" on:click={addWebSource}>
            <Icon id="add" white />
            <span>Add to Preview</span>
        </MaterialButton>
    </div>

    {#if webUrlError}
        <p class="url-error">{webUrlError}</p>
    {/if}

    {#if visibleSourceCount}
        <div class="source-sections">
            {#each visibleSections as section (section.id)}
                {#if section.sources.length}
                    <section class="source-section">
                        <div class="section-header">
                            <span>
                                <Icon id={section.icon} size={0.95} white />
                                {section.title}
                            </span>
                            <small>{section.sources.length}</small>
                        </div>

                        <div class="source-grid">
                            {#each section.sources as source (sourceKey(source))}
                                <div class="source-state" title="{isProgram(source) ? 'Program' : ''}{isProgram(source) && isPreview(source) ? ' / ' : ''}{isPreview(source) ? 'Preview' : ''}">
                                    {#if source.type === "camera"}
                                        <Cam cam={{ id: source.id, name: source.name, group: source.cameraGroup || "" }} showPlayOnHover={false} on:click={(event) => selectPreview(source, event)} />
                                    {:else if source.type === "screen"}
                                        <Capture bind:streams screen={source.screen || { id: source.id, name: source.name }} on:click={(event) => selectPreview(source, event)} />
                                    {:else if source.type === "ndi"}
                                        <NDIStream screen={{ id: source.id, name: source.name }} on:click={(event) => selectPreview(source, event)} />
                                    {:else if source.type === "blackmagic"}
                                        <BmdStream screen={{ id: source.id, name: source.name, data: source.data }} on:click={(event) => selectPreview(source, event)} />
                                    {:else if source.type === "web"}
                                        <Card loaded label={source.name} title={source.url || source.name} icon="input" outlineColor={isPreview(source) ? "#16a34a" : isProgram(source) ? "#ef4444" : null} active={isProgram(source)} white on:click={(event) => selectPreview(source, event)}>
                                            <SelectElem id="player" data={source.id} fill draggable>
                                                <div class="web-card">
                                                    <Icon id="input" size={2.6} white />
                                                    <p>{formatWebUrl(source.url)}</p>
                                                </div>
                                            </SelectElem>
                                        </Card>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}
            {/each}
        </div>
    {:else if anyLoading}
        <Center>
            <Loader />
        </Center>
    {:else}
        <Center faded>
            <div class="empty-state">
                <Icon id="input" size={3} white />
                <p>{searchValue ? "No matching live sources" : "No live sources found"}</p>
                <MaterialButton variant="outlined" on:click={() => refreshAll(true)}>
                    <Icon id="reset" white />
                    <span>Refresh</span>
                </MaterialButton>
            </div>
        </Center>
    {/if}
</div>

<style>
    .switcher {
        width: 100%;
        min-height: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .control-strip {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
        align-items: stretch;
        gap: 8px;
        padding: 4px;
    }

    .status-card {
        min-width: 0;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        background: var(--primary-darkest);
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .status-card.program {
        border-color: rgba(239, 68, 68, 0.45);
    }

    .status-card.preview {
        border-color: rgba(34, 197, 94, 0.38);
    }

    .status-label {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text);
        opacity: 0.68;
        font-size: 0.76em;
        text-transform: uppercase;
    }

    .status-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #ef4444;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
    }

    .status-name {
        color: var(--text);
        font-size: 0.96em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .switcher-actions {
        display: flex;
        align-items: stretch;
        gap: 6px;
    }

    .switcher-actions :global(button) {
        height: 100%;
        white-space: nowrap;
    }

    .web-url-panel {
        display: grid;
        grid-template-columns: minmax(220px, 2fr) minmax(140px, 1fr) auto;
        align-items: stretch;
        gap: 8px;
        padding: 0 4px;
        width: 100%;
    }

    .web-url-panel :global(button) {
        height: 50px;
        white-space: nowrap;
    }

    .url-error {
        margin: -2px 8px 0;
        color: #ef4444;
        font-size: 0.82em;
    }

    .source-sections {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
        padding: 0 4px 80px;
    }

    .source-section {
        display: flex;
        flex-direction: column;
        gap: 5px;
        width: 100%;
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 3px;
        color: var(--text);
        font-size: 0.88em;
        font-weight: 600;
    }

    .section-header span {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }

    .section-header small {
        color: var(--text);
        opacity: 0.55;
        font-weight: 500;
    }

    .source-grid {
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
    }

    .source-state {
        display: contents;
    }

    .web-card {
        width: 100%;
        height: 100%;
        min-height: 70px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        color: var(--text);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01));
    }

    .web-card p {
        margin: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.74em;
        opacity: 0.72;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .empty-state p {
        margin: 0;
    }

    @media (max-width: 900px) {
        .control-strip {
            grid-template-columns: 1fr;
        }

        .switcher-actions {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .switcher-actions :global(button) {
            min-width: 0;
        }

        .web-url-panel {
            grid-template-columns: 1fr;
        }
    }
</style>