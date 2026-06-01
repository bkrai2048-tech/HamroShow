import type { ChildProcessWithoutNullStreams } from "child_process"
import { exec, execFile, spawn } from "child_process"
import { existsSync } from "fs"
import path from "path"
import { promisify } from "util"
import { Main } from "../../types/IPC/Main"
import { sendMain } from "../IPC/main"

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

let ffmpegPath: string | null = null
let detectAttempted = false

let proc: ChildProcessWithoutNullStreams | null = null
let lastStderr = ""
let outputUrl = ""
let stopRequested = false
let bytesWritten = 0
let chunksWritten = 0
let lastProgressAt = 0

export async function checkFfmpeg(): Promise<{ available: boolean; path?: string; version?: string }> {
    if (detectAttempted && ffmpegPath) {
        return { available: true, path: ffmpegPath }
    }
    detectAttempted = true

    const isWin = process.platform === "win32"
    const localPath = getLocalFfmpegPath()
    if (localPath) {
        ffmpegPath = localPath
        return { available: true, path: ffmpegPath, version: await getFfmpegVersion(ffmpegPath) }
    }

    const lookup = isWin ? "where.exe ffmpeg" : "which ffmpeg"

    try {
        const { stdout } = await execAsync(lookup, { timeout: 5000 })
        const found = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0]
        if (!found) return { available: false }

        ffmpegPath = found
        return { available: true, path: ffmpegPath, version: await getFfmpegVersion(ffmpegPath) }
    } catch {
        ffmpegPath = null
        return { available: false }
    }
}

function getLocalFfmpegPath() {
    const executableName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
    const candidates = [
        path.join(path.dirname(process.execPath), "bin", executableName),
        path.join(process.resourcesPath || "", "..", "bin", executableName),
        path.join(process.cwd(), "bin", executableName)
    ]

    return candidates.find((candidate) => candidate && existsSync(candidate)) || ""
}

async function getFfmpegVersion(executablePath: string) {
    try {
        const { stdout } = await execFileAsync(executablePath, ["-version"], { timeout: 5000 })
        return stdout.split(/\r?\n/)[0]
    } catch {
        return undefined
    }
}

export async function startStream(opts: { rtmpUrl: string; mimeType: string }): Promise<{ started: boolean; error?: string }> {
    if (proc) return { started: false, error: "A stream is already running. Stop it first." }

    const url = (opts.rtmpUrl || "").trim()
    if (!url || !/^rtmps?:\/\//i.test(url)) {
        return { started: false, error: "Invalid RTMP URL. Must start with rtmp:// or rtmps://" }
    }

    const check = await checkFfmpeg()
    if (!check.available || !ffmpegPath) {
        return { started: false, error: "FFmpeg not found on PATH. Please install FFmpeg from https://ffmpeg.org/download.html and ensure 'ffmpeg' is on your system PATH." }
    }

    const args = [
        "-hide_banner",
        "-loglevel", "error",
        "-fflags", "+genpts+nobuffer",
        "-flags", "low_delay",
        "-thread_queue_size", "1024",
        "-f", "webm",
        "-i", "pipe:0",
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-vf", "scale='min(1920,iw)':'-2':flags=lanczos,fps=30,format=yuv420p",
        "-profile:v", "high",
        "-level", "4.1",
        "-g", "60",
        "-keyint_min", "60",
        "-x264-params", "keyint=60:min-keyint=60:scenecut=0:nal-hrd=cbr",
        "-b:v", "6000k",
        "-maxrate", "6000k",
        "-bufsize", "6000k",
        "-c:a", "aac",
        "-ar", "44100",
        "-ac", "2",
        "-b:a", "160k",
        "-max_muxing_queue_size", "1024",
        "-shortest",
        "-f", "flv",
        "-flvflags", "no_duration_filesize",
        "-rtmp_live", "live",
        url
    ]

    try {
        proc = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    } catch (err: any) {
        return { started: false, error: `Failed to launch FFmpeg: ${err?.message || err}` }
    }

    lastStderr = ""
    outputUrl = url
    stopRequested = false
    bytesWritten = 0
    chunksWritten = 0
    lastProgressAt = 0

    proc.stderr.on("data", (chunk) => {
        const text = sanitizeFfmpegOutput(chunk.toString())
        lastStderr = (lastStderr + text).slice(-2000)
        const statusMessage = getFfmpegStatusMessage(text)
        if (statusMessage) sendMain(Main.STREAM_STATUS, { state: "live", message: statusMessage })
    })

    proc.on("error", (err) => {
        sendMain(Main.STREAM_STATUS, { state: "error", message: `FFmpeg error: ${err.message}` })
        proc = null
    })

    proc.on("close", (code) => {
        const msg = code === 0 || stopRequested ? "Stream stopped." : getFfmpegCloseMessage(code)
        sendMain(Main.STREAM_STATUS, { state: code === 0 || stopRequested ? "stopped" : "error", message: msg })
        proc = null
    })

    proc.stdin.on("error", () => {
        // swallow EPIPE — close handler will report
    })

    sendMain(Main.STREAM_STATUS, { state: "starting" })
    return { started: true }
}

function sanitizeFfmpegOutput(text: string) {
    let clean = text
    const key = getStreamKey(outputUrl)
    if (outputUrl) clean = clean.replaceAll(outputUrl, "[rtmp-url-hidden]")
    if (key) clean = clean.replaceAll(key, "[stream-key-hidden]")

    return clean
}

function getFfmpegStatusMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return ""
    if (/more than \d+ frames duplicated/i.test(trimmed)) return ""
    if (/error|failed|invalid|denied|forbidden|unauthorized|i\/o/i.test(trimmed)) return summarizeFfmpegError(trimmed)

    return ""
}

function getFfmpegCloseMessage(code: number | null) {
    const summary = summarizeFfmpegError(lastStderr)
    if (summary) return summary

    return `FFmpeg exited with code ${code}. ${lastStderr || "No FFmpeg details were reported."}`
}

function summarizeFfmpegError(text: string) {
    if (!text.trim()) return ""
    if (/(?:-10053|i\/o error|specified session has been invalidated|error closing file)/i.test(text)) {
        return "Facebook closed the RTMPS connection. This usually means the Live Producer stream key/session expired, the stream key does not match this Live Producer page, or Facebook rejected the incoming stream. Create a new Facebook Live video, copy the fresh server URL and stream key, keep Live Producer open, then start streaming again."
    }
    if (/(?:401|403|unauthorized|forbidden|permission|auth)/i.test(text)) {
        return "Facebook rejected the stream credentials. Copy a fresh stream key from the current Facebook Live Producer page and try again."
    }

    return text.trim()
}

function getStreamKey(url: string) {
    try {
        return new URL(url).pathname.split("/").filter(Boolean).pop() || ""
    } catch {
        return url.split("/").filter(Boolean).pop() || ""
    }
}

export function writeStreamChunk(buffer: ArrayBuffer | Uint8Array) {
    if (!proc || !proc.stdin.writable) return
    const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : Buffer.from(buffer)
    try {
        proc.stdin.write(buf)
        chunksWritten += 1
        bytesWritten += buf.byteLength

        const now = Date.now()
        if (chunksWritten === 1 || now - lastProgressAt > 5000) {
            lastProgressAt = now
            sendMain(Main.STREAM_STATUS, { state: "live", message: `Sending ${formatBytes(bytesWritten)} of video data to RTMP server...` })
        }
    } catch {
        // ignore
    }
}

function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function stopStream() {
    if (!proc) return
    stopRequested = true
    try {
        proc.stdin.end()
    } catch {
        // ignore
    }
    const handle = proc
    setTimeout(() => {
        if (handle && !handle.killed) {
            try { handle.kill("SIGKILL") } catch { /* */ }
        }
    }, 2000)
}
