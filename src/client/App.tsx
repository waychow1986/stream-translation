import { useCallback, useEffect, useRef, useState } from "react";
import { TranslationSocket } from "./api/translation-socket";
import pcmWorkletUrl from "./audio/pcm-worklet.ts?worker&url";
import {
  SubtitleView,
  type DisplaySubtitle,
} from "./components/SubtitleView";

type CaptureResources = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  sink: GainNode;
  stream: MediaStream;
};

type SessionStatus = "idle" | "starting" | "streaming" | "stopping";

function releaseCapture(resources: CaptureResources | undefined): void {
  if (!resources) return;
  resources.processor.port.onmessage = null;
  resources.processor.disconnect();
  resources.source.disconnect();
  resources.sink.disconnect();
  for (const track of resources.stream.getTracks()) track.stop();
  void resources.context.close().catch(() => undefined);
}

export function App() {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string>();
  const [subtitles, setSubtitles] = useState<DisplaySubtitle[]>([]);
  const socketRef = useRef<TranslationSocket | undefined>(undefined);
  const captureRef = useRef<CaptureResources | undefined>(undefined);

  const stop = useCallback(() => {
    if (status !== "streaming") return;
    setStatus("stopping");
    releaseCapture(captureRef.current);
    captureRef.current = undefined;
    socketRef.current?.endAudio();
  }, [status]);

  const start = useCallback(async () => {
    if (status !== "idle") return;
    setStatus("starting");
    setError(undefined);
    setSubtitles([]);

    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let socket: TranslationSocket | undefined;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      context = new AudioContext();
      await context.resume();
      await context.audioWorklet.addModule(pcmWorkletUrl);

      let markStarted: (() => void) | undefined;
      const sessionStarted = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      socket = new TranslationSocket({
        onSubtitle: (event) => {
          setSubtitles((current) => {
            const next = new Map(current.map((item) => [item.segmentId, item]));
            next.set(event.segmentId, event);
            return [...next.values()].sort((left, right) => left.ordinal - right.ordinal);
          });
        },
        onEvent: (event) => {
          if (event.type === "session.started") markStarted?.();
          if (event.type === "session.end") {
            socketRef.current?.close();
            socketRef.current = undefined;
            setStatus("idle");
          }
        },
      });
      socketRef.current = socket;
      await socket.connect();
      await sessionStarted;

      const source = context.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(context, "pcm-frame-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const sink = context.createGain();
      sink.gain.value = 0;
      processor.port.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (data instanceof ArrayBuffer) socket?.sendAudio(data);
      };
      source.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);
      captureRef.current = { context, source, processor, sink, stream };
      setStatus("streaming");
    } catch {
      socket?.close();
      if (context) void context.close().catch(() => undefined);
      if (stream) for (const track of stream.getTracks()) track.stop();
      socketRef.current = undefined;
      setError("无法开始语音翻译，请检查麦克风权限和连接后重试。");
      setStatus("idle");
    }
  }, [status]);

  useEffect(
    () => () => {
      releaseCapture(captureRef.current);
      socketRef.current?.close();
    },
    [],
  );

  return (
    <main>
      <h1>流式语音翻译</h1>
      <p>开始后，会议中的可识别外语语音将持续显示为中文字幕。</p>
      <button type="button" onClick={() => void start()} disabled={status !== "idle"}>
        开始
      </button>
      <button type="button" onClick={stop} disabled={status !== "streaming"}>
        停止
      </button>
      <p role="status">
        {status === "idle" && "等待开始"}
        {status === "starting" && "正在连接"}
        {status === "streaming" && "正在翻译"}
        {status === "stopping" && "正在完成剩余字幕"}
      </p>
      {error && <p role="alert">{error}</p>}
      <SubtitleView subtitles={subtitles} />
    </main>
  );
}
