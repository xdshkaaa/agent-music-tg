import { useEffect, useRef, useState } from "react";

const CHARS = "абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTextScramble(text: string, trigger: number, duration = 500) {
  const [displayText, setDisplayText] = useState(text);
  const [isComplete, setIsComplete] = useState(true);
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (trigger <= 0 || prefersReducedMotion()) {
      setDisplayText(text);
      setIsComplete(true);
      return;
    }

    setIsComplete(false);
    const totalFrames = Math.max(1, Math.floor(duration / 16));
    frameRef.current = 0;

    const animate = () => {
      frameRef.current++;
      const progress = frameRef.current / totalFrames;
      const revealedCount = Math.floor(progress * text.length);

      let result = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === " " || /[?!.,:;—-]/.test(ch)) {
          result += ch;
        } else if (i < revealedCount) {
          result += ch;
        } else {
          result += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }

      setDisplayText(result);

      if (frameRef.current < totalFrames) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayText(text);
        setIsComplete(true);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, trigger, duration]);

  return { displayText, isComplete };
}
