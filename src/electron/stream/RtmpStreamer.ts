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
        "-loglevel", "warning",
        "-f", "webm",
        "-i", "pipe:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-g", "60",
        "-keyint_min", "60",
        "-b:v", "3500k",
        "-maxrate", "3500k",
        "-bufsize", "7000k",
        "-c:a", "aac",
        "-ar", "44100",
        "-b:a", "128k",
        "-f", "flv",
        url
    ]

    try {
        proc = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    } catch (err: any) {
        return { started: false, error: `Failed to launch FFmpeg: ${err?.message || err}` }
    }

    lastStderr = ""

    proc.stderr.on("data", (chunk) => {
        const text = chunk.toString()
        lastStderr = (lastStderr + text).slice(-2000)
        sendMain(Main.STREAM_STATUS, { state: "live", message: text.trim() })
    })

    proc.on("error", (err) => {
        sendMain(Main.STREAM_STATUS, { state: "error", message: `FFmpeg error: ${err.message}` })
        proc = null
    })

    proc.on("close", (code) => {
        const msg = code === 0 ? "Stream ended." : `FFmpeg exited with code ${code}. ${lastStderr}`
        sendMain(Main.STREAM_STATUS, { state: code === 0 ? "stopped" : "error", message: msg })
        proc = null
    })

    proc.stdin.on("error", () => {
        // swallow EPIPE — close handler will report
    })

    sendMain(Main.STREAM_STATUS, { state: "starting" })
    return { started: true }
}

export function writeStreamChunk(buffer: ArrayBuffer | Uint8Array) {
    if (!proc || !proc.stdin.writable) return
    const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : Buffer.from(buffer)
    try {
        proc.stdin.write(buf)
    } catch {
        // ignore
    }
}

export function stopStream() {
    if (!proc) return
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
