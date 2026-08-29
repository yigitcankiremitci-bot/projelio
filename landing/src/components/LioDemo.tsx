"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Dict } from "@/i18n";
import { appLinks } from "@/lib/site";
import { ArrowRight, Send, Sparkle } from "./Icons";

/** Ziyaretçinin demoda gönderebileceği mesaj sayısı. */
const MESSAGE_LIMIT = 10;

type Msg = { id: number; from: "user" | "lio"; text: string; at: string };

/** Türkçe aksanları sadeleştirip karşılaştırmaya uygun hale getirir. */
function normalize(input: string): string {
  return input
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Senaryo sırasına göre ek anahtar kelimeler (TR + EN).
 * Sözlükteki senaryo sırası değişirse burayı da güncelleyin.
 */
const EXTRA_KEYWORDS: string[][] = [
  ["bugun", "gun", "gundem", "yapmam", "yapilacak", "isim", "today", "plate", "agenda", "todo"],
  ["baslat", "basla", "start", "devam", "1", "birinci", "ilk", "begin"],
  ["gelir", "ciro", "kazanc", "tahsilat", "para", "revenue", "income", "cash", "money", "kar"],
  ["musteri", "firma", "aydin", "cari", "customer", "client", "account", "deal", "teklif durumu"],
  ["ozet", "rapor", "haftalik", "summary", "report", "weekly", "durum raporu"],
  ["gorev", "olustur", "ac", "hatirlat", "task", "create", "remind", "yarin", "tomorrow", "ekle"],
];

const now = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function LioDemo({ dict }: { dict: Dict }) {
  const scenarios = dict.demo.scenarios;

  const [messages, setMessages] = useState<Msg[]>([
    { id: 0, from: "lio", text: dict.demo.greeting, at: now() },
  ]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [used, setUsed] = useState<number[]>([]);
  const [sent, setSent] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  /** Serbest metni en yakın senaryoyla eşler; eşleşme zayıfsa -1 döner. */
  const matcher = useMemo(() => {
    const bank = scenarios.map((s, i) => {
      const words = new Set(
        `${normalize(s.chip)} ${normalize(s.user)}`
          .split(" ")
          .filter((w) => w.length >= 3),
      );
      EXTRA_KEYWORDS[i]?.forEach((w) => words.add(normalize(w)));
      return Array.from(words);
    });

    return (raw: string): number => {
      const text = normalize(raw);
      if (!text) return -1;
      let best = -1;
      let bestScore = 0;
      bank.forEach((words, i) => {
        let score = 0;
        words.forEach((w) => {
          if (w.length >= 3 && text.includes(w)) score += w.length >= 5 ? 2 : 1;
        });
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      return bestScore >= 2 ? best : -1;
    };
  }, [scenarios]);

  function push(from: Msg["from"], text: string) {
    setMessages((prev) => [...prev, { id: idRef.current++, from, text, at: now() }]);
  }

  function respond(text: string, index: number) {
    push("user", text);
    setSent((n) => n + 1);
    setTyping(true);
    const reply = index >= 0 ? scenarios[index].reply : dict.demo.fallback;
    const delay = Math.min(1500, 550 + reply.length * 3);
    const t = setTimeout(() => {
      setTyping(false);
      push("lio", reply);
      if (index >= 0) setUsed((u) => (u.includes(index) ? u : [...u, index]));
    }, delay);
    timers.current.push(t);
  }

  function onChip(index: number) {
    if (typing || locked) return;
    respond(scenarios[index].user, index);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || typing || locked) return;
    setInput("");
    respond(value, matcher(value));
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTyping(false);
    setUsed([]);
    setSent(0);
    idRef.current = 1;
    setMessages([{ id: 0, from: "lio", text: dict.demo.greeting, at: now() }]);
  }

  const locked = sent >= MESSAGE_LIMIT;
  const remaining = Math.max(0, MESSAGE_LIMIT - sent);

  return (
    <div className="demo" id="demo">
      <div className="demo-shell">
        <div className="demo-topbar">
          <span className="demo-avatar" aria-hidden="true">
            Lio
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{dict.demo.assistantName}</strong>
            <span className="status">
              <i className="live-dot" /> {dict.demo.online} · {dict.demo.assistantRole}
            </span>
          </span>
          <button
            type="button"
            onClick={reset}
            className="chip"
            style={{ padding: "6px 12px", fontSize: "0.76rem" }}
          >
            {dict.demo.reset}
          </button>
        </div>

        <div className="demo-body" ref={bodyRef} role="log" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={m.from === "user" ? "bubble bubble-user" : "bubble bubble-lio"}>
              {m.text}
              <time>{m.at}</time>
            </div>
          ))}
          {typing && (
            <div className="bubble bubble-lio" aria-label="…">
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>

        {locked ? (
          <div className="demo-lock">
            <span className="demo-lock-icon" aria-hidden="true">
              <Sparkle size={22} />
            </span>
            <strong>{dict.demo.limitTitle}</strong>
            <p>{dict.demo.limitText}</p>
            <div className="demo-lock-actions">
              <a className="btn btn-primary" href={appLinks.signup}>
                {dict.demo.limitCta} <ArrowRight />
              </a>
              <button type="button" className="chip" onClick={reset}>
                {dict.demo.limitReset}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="demo-suggestions" aria-label={dict.demo.suggestionsLabel}>
              {scenarios.map((s, i) => (
                <button
                  key={s.chip}
                  type="button"
                  className="chip"
                  onClick={() => onChip(i)}
                  disabled={typing || used.includes(i)}
                >
                  {s.chip}
                </button>
              ))}
            </div>

            <form className="demo-input" onSubmit={onSubmit}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={dict.demo.placeholder}
                aria-label={dict.demo.placeholder}
                maxLength={200}
              />
              <button
                type="submit"
                className="demo-send"
                aria-label={dict.demo.send}
                disabled={typing}
              >
                <Send />
              </button>
            </form>

            <p className="demo-note">
              {sent > 0 && (
                <span className="demo-counter">
                  {remaining} {dict.demo.remaining}
                </span>
              )}
              {dict.demo.note}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
