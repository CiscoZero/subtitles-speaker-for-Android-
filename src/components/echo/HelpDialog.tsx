import { BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-[15px] font-semibold text-espresso">{title}</h3>
      <div className="mt-1.5 space-y-1.5 text-[12.5px] leading-relaxed text-espresso/80">{children}</div>
    </section>
  );
}

export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-espresso/20 bg-paper-light px-3 py-1.5 text-[12px] font-medium text-espresso transition hover:border-rust/60 hover:text-rust"
        >
          <BookOpen className="size-3.5" />
          使用说明 & 自测
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-[640px] overflow-y-auto border-espresso/15 bg-paper-light">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-espresso">译声机 · 使用说明</DialogTitle>
          <DialogDescription className="text-[12px] text-espresso-mute">
            建议使用 Microsoft Edge 或 Chrome。所有文件与朗读都在本机完成，不会上传。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Block title="核心循环（验收标准）">
            <p>
              原声播放 → 到达中文字幕起始时间 → <b>立即暂停原声</b> → 用中文朗读该句 →{" "}
              <b>朗读完整结束后</b> → 从暂停处继续原声 → 处理下一条字幕。
            </p>
            <p className="rounded-lg bg-espresso/[0.06] px-2.5 py-2">
              「自动暂停」开启时，触发基准始终是原音频的真实播放进度（audio.currentTime），
              朗读期间原声处于暂停状态，因此不会跳过任何原声内容。关闭后原声连续播放，
              中文朗读按字幕顺序进入独立队列。
            </p>
          </Block>

          <Block title="三步开始">
            <ol className="list-decimal space-y-1 pl-4">
              <li>装入「音频卡带」：MP3 / WAV / M4A / OGG / FLAC（由浏览器解码）。</li>
              <li>装入「字幕卡带」：WebVTT(.vtt) / SRT(.srt) / ASS·SSA(.ass) / LRC(.lrc) / 纯文本(.txt)。编码自动识别 UTF-8、UTF-16、GB18030。</li>
              <li>点「开始」。空格键也可以开始 / 暂停。</li>
            </ol>
          </Block>

          <Block title="细节功能">
            <ul className="list-disc space-y-1 pl-4">
              <li>字幕卷：点击任意一句 → 跳到该句并立即朗读；支持文本搜索；卡座上的 ‹ › 切换上一句 / 下一句。</li>
              <li>时间偏移：字幕整体偏早/偏晚时，用 ±0.1s / ±0.5s 校正（以 100ms 为单位）。</li>
              <li>倍速：0.75×–1.5×，对齐真实播放进度不影响字幕触发。</li>
              <li>过期字幕策略：「逐条补读」保证不漏句；「跳到进度」适合快速跟读。</li>
              <li>朗读中想跳过：点「跳过本句朗读」，原声立刻继续，不丢原声内容。</li>
              <li>关闭自动暂停：可查看待播数量，分别停止当前朗读或清空队列；主暂停只控制原声。</li>
              <li>语速 / 音量 / 音高、时间偏移与语音选择会保存在本机，下次打开自动沿用。</li>
            </ul>
          </Block>

          <Block title="键盘快捷键">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {[
                ["空格", "开始 / 暂停原声（自动暂停模式下会打断当前朗读）"],
                ["← / →", "后退 / 前进 5 秒"],
                ["J / K", "下一句 / 上一句字幕"],
                ["S", "跳过正在朗读的这一句"],
              ].map(([keys, action]) => (
                <div key={keys} className="flex items-center gap-2">
                  <kbd className="rounded-md border border-espresso/20 bg-espresso/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-espresso">
                    {keys}
                  </kbd>
                  <span className="text-[12px]">{action}</span>
                </div>
              ))}
            </div>
          </Block>

          <Block title="自测清单（约 3 分钟）">
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                装入任意音频 + 字幕，点「开始」：应看到「原声播放中」灯亮、卡盘旋转，接近字幕点时自动切到
                「中文朗读中」并听到中文，读完后原声自动继续。
              </li>
              <li>
                反复观察 5 条以上：每次暂停处的时间戳应≈该句字幕的起始时间（不会被朗读时长推后）。
              </li>
              <li>拖进度条到中间再播放：应从新位置继续，并且只朗读该位置之后的字幕。</li>
              <li>朗读到一半点「暂停」，再点「继续」：该句会被完整重读一次，原声不会跳过内容。</li>
              <li>长音频测试：播放 30 分钟以上，字幕不漂移；「已读 N / 总数」单调递增。</li>
              <li>偏移测试：把偏移调到 +1.0s，同一条字幕应在更晚的时间点触发。</li>
            </ol>
          </Block>

          <Block title="当成桌面应用 / 打包 .exe">
            <p>
              <b>最省事：</b>用 Edge / Chrome 打开本页，点地址栏右侧的「安装」图标（菜单 →
              应用 → 安装此站点为应用）。桌面会多一个独立窗口的图标，双击即可用，朗读仍走系统语音。
            </p>
            <p>
              <b>要真正的 .exe：</b>仓库里的{" "}
              <code className="rounded bg-espresso/[0.08] px-1 font-mono text-[11px]">desktop/</code>{" "}
              是一个 Electron 打包工程，在 Windows 上依次执行：
            </p>
            <pre className="overflow-x-auto rounded-lg bg-espresso px-3 py-2 font-mono text-[11px] leading-relaxed text-paper">
              {["cd desktop", "npm install", "npm run check-voice", "npm run dist"].join("\n")}
            </pre>
            <p>
              产物在 <code className="rounded bg-espresso/[0.08] px-1 font-mono text-[11px]">desktop/release/</code>
              ：安装版 + 免安装便携版。<span className="rounded bg-mustard/20 px-1">注意</span>{" "}
              打包后的 Electron 不带 Windows 语音组件，桌面版改由主进程调用系统自带的 System.Speech（SAPI）
              合成音频再播放；先跑 <b>check-voice</b> 确认能出声，再打包。详见 desktop/README.md。
            </p>
          </Block>

          <Block title="常见问题">
            <p>
              <b>没有中文声音？</b> Windows「设置 → 时间和语言 → 语音 → 添加语音」安装「中文（简体）」，
              然后在上面的「中文语音」下拉里选 Microsoft 中文语音（如 Huihui / Xiaoxiao），点「试听」。
            </p>
            <p>
              <b>朗读读一半被截断？</b> 长句会自动分段朗读；若仍被截断，请更新 Edge / Chrome。
            </p>
            <p>
              <b>音频播不出来？</b> 少数编码（如部分 ALAC/APE）浏览器不支持，请转成 MP3 / M4A / WAV 后重试。
            </p>
          </Block>
        </div>
      </DialogContent>
    </Dialog>
  );
}
