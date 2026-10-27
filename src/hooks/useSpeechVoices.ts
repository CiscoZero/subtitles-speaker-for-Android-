import { useEffect, useState } from "react";
import { isSpeechSupported, listNativeVoices, listVoices, nativeTts } from "@/lib/tts";
import { nativeEcho } from "@/platform/androidNative";

/**
 * SpeechSynthesis voices load asynchronously (and sometimes very late on
 * Windows), so we retry a few times and also listen to `voiceschanged`.
 * In the desktop build voices come from the SAPI bridge instead.
 */
export function useSpeechVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const androidPlugin = nativeEcho();
  const supported = androidPlugin !== null || isSpeechSupported();

  useEffect(() => {
    if (!supported) return;
    let alive = true;

    if (androidPlugin) {
      const loadAndroidVoices = () => {
        void androidPlugin
          .getVoices()
          .then(({ voices: nativeVoices }) => {
            if (!alive || nativeVoices.length === 0) return;
            setVoices(
              nativeVoices.map(
                (voice) =>
                  ({
                    name: voice.name,
                    voiceURI: voice.name,
                    lang: voice.lang,
                    localService: voice.localService,
                    default: false,
                  }) as unknown as SpeechSynthesisVoice,
              ),
            );
          })
          .catch(() => undefined);
      };
      loadAndroidVoices();
      const timers = [300, 900, 2000, 4000].map((delay) =>
        window.setTimeout(loadAndroidVoices, delay),
      );
      return () => {
        alive = false;
        timers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    if (nativeTts()) {
      void listNativeVoices().then((next) => {
        if (alive && next.length) setVoices(next);
      });
      return () => {
        alive = false;
      };
    }

    const load = () => {
      if (!alive) return;
      const next = listVoices();
      if (next.length) setVoices(next);
    };
    load();
    const synth = window.speechSynthesis;
    synth.addEventListener("voiceschanged", load);
    const timers = [300, 900, 2000, 4000].map((delay) => window.setTimeout(load, delay));
    return () => {
      alive = false;
      synth.removeEventListener("voiceschanged", load);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [supported, androidPlugin]);

  return { voices, supported };
}
