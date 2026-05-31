<script lang="ts">
    import { onDestroy, onMount } from "svelte"
    import { BLACKMAGIC, NDI } from "../../../../types/Channels"
    import { Main } from "../../../../types/IPC/Main"
    import { requestMain } from "../../../IPC/main"
    import { type CameraData, cameraManager } from "../../../media/cameraManager"
    import { outLocked, outputs, special } from "../../../stores"
    import { destroy, receive, send } from "../../../utils/request"
    import Icon from "../../helpers/Icon.svelte"
    import { getFirstActiveOutput, setOutput } from "../../helpers/output"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
    import Loader from "../../main/Loader.svelte"
    import { clearBackground } from "../../output/clear"
    import Center from "../../system/Center.svelte"
    import BmdStream from "./BMDStream.svelte"
    import Cam from "./Cam.svelte"
    import Capture from "./Capture.svelte"
    import NDIStream from "./NDIStream.svelte"

    export let searchValue = ""
    export let streams: MediaStream[] = []

    type SourceType = "camera" | "screen" | "ndi" | "blackmagic"

    interface SwitcherSource {
        id: string
        name: string
        section: string
        type: SourceType
        icon: string
        cameraGroup?: string
        screen?: { id: string; name: string }
        data?: any
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

    $: sourceSections = [
        { id: "cameras", title: "Cameras", icon: "camera", loading: loadingLocal, sources: cameraSources.filter(matchesSearch) },
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

    function matchesSearch(source: SwitcherSource) {
        const search = normalize(searchValue)
        if (!search) return true

        return normalize(source.name).includes(search) || normalize(source.section).includes(search) || normalize(source.type).includes(search)
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
        return `${source.type}:${source.id}`
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
    }
</style>