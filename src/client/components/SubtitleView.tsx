import type { SubtitleEvent } from "../../shared/protocol";

export type DisplaySubtitle = Pick<
  SubtitleEvent,
  "segmentId" | "ordinal" | "revision" | "sourceLanguage" | "text" | "type"
>;

export function SubtitleView({ subtitles }: { subtitles: DisplaySubtitle[] }) {
  if (subtitles.length === 0) {
    return <p aria-live="polite">中文字幕将在识别到外语语音后显示。</p>;
  }

  return (
    <ol aria-label="中文字幕" aria-live="polite">
      {subtitles.map((subtitle) => (
        <li key={subtitle.segmentId} lang="zh-CN">
          {subtitle.text}
        </li>
      ))}
    </ol>
  );
}
