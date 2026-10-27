import { useRef, useState } from "react";
import { Captions, Loader2, Music2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SlotProps = {
  kind: "audio" | "subtitle";
  title: string;
  hint: string;
  fileName: string | null;
  meta: string | null;
  accept: string;
  loading?: boolean;
  onFile: (file: File) => void;
  onPick?: () => void;
  onClear: () => void;
};

function SourceSlot({ kind, title, hint, fileName, meta, accept, loading, onFile, onPick, onClear }: SlotProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const Icon = kind === "audio" ? Music2 : Captions;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border p-3 transition-colors",
        over
          ? "border-rust bg-rust/10"
          : fileName
            ? "border-espresso/20 bg-paper-light"
            : "border-dashed border-espresso/25 bg-paper-light/50 hover:border-rust/50",
      )}
    >
      <div
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl transition-colors",
          fileName ? "bg-rust text-paper" : "bg-espresso/85 text-paper",
        )}
      >
        {loading ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" strokeWidth={1.75} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="label-mono text-espresso-mute">{title}</p>
        <p className={cn("truncate text-sm", fileName ? "font-medium text-espresso" : "text-espresso-mute")}>
          {fileName ?? hint}
        </p>
        {meta && <p className="label-mono mt-0.5 text-espresso-mute/80">{meta}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {fileName && (
          <button
            type="button"
            onClick={onClear}
            aria-label="移除文件"
            className="grid size-8 place-items-center rounded-full text-espresso-mute transition-colors hover:bg-espresso/10 hover:text-espresso"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onPick ?? (() => inputRef.current?.click())}
          className="rounded-full bg-espresso px-3.5 py-2 text-xs font-medium text-paper transition-colors hover:bg-espresso-soft"
        >
          {fileName ? "更换" : "装入"}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

type SourceSlotsProps = {
  audioName: string | null;
  audioMeta: string | null;
  subtitleName: string | null;
  subtitleMeta: string | null;
  parsingSubtitle: boolean;
  onAudioFile: (file: File) => void;
  onSubtitleFile: (file: File) => void;
  onAudioPick?: () => void;
  onSubtitlePick?: () => void;
  onClearAudio: () => void;
  onClearSubtitle: () => void;
};

export function SourceSlots({
  audioName,
  audioMeta,
  subtitleName,
  subtitleMeta,
  parsingSubtitle,
  onAudioFile,
  onSubtitleFile,
  onAudioPick,
  onSubtitlePick,
  onClearAudio,
  onClearSubtitle,
}: SourceSlotsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SourceSlot
        kind="audio"
        title="音频卡带"
        hint="拖入或选择外语音频"
        fileName={audioName}
        meta={audioMeta}
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.webm"
        onFile={onAudioFile}
        onPick={onAudioPick}
        onClear={onClearAudio}
      />
      <SourceSlot
        kind="subtitle"
        title="字幕卡带"
        hint="拖入或选择中文字幕 .vtt / .srt / .ass / .lrc"
        fileName={subtitleName}
        meta={subtitleMeta}
        accept=".vtt,.srt,.ass,.ssa,.lrc,.txt,text/vtt,text/plain"
        loading={parsingSubtitle}
        onFile={onSubtitleFile}
        onPick={onSubtitlePick}
        onClear={onClearSubtitle}
      />
    </div>
  );
}
