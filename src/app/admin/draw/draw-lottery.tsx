"use client";

/**
 * กล่องจับสลากแบบหมุน — ผู้ดูแลกดครั้งเดียว แล้วผลค่อย ๆ เฉลยทีละช่อง
 *
 * ลำดับการทำงาน:
 *   1. ขอผลทั้งชุดจากเซิร์ฟเวอร์ครั้งเดียว (ยังไม่บันทึก) ตัวสุ่มตรวจกติกาให้เรียบร้อยแล้ว
 *   2. หมุนรายชื่อไปเรื่อย ๆ แล้วหยุดที่ผลจริงของช่องนั้น
 *   3. บันทึกช่องนั้นทันทีที่หยุด แล้วไปช่องถัดไป
 *
 * ที่ต้องบันทึกทีละช่องเพราะอยากให้คนดูหน้าสาธารณะเห็นผลค่อย ๆ โผล่ตามจังหวะจริง
 * ถ้าบันทึกรวดเดียวคนดูจะเห็นครบพร้อมกันภายใน 3 วินาที ซึ่งหมดความสนุก
 *
 * การหมุนเป็นภาพในเบราว์เซอล์ล้วน ไม่ได้ถามเซิร์ฟเวอร์ระหว่างหมุน
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { assignDrawAction, planRandomDrawAction } from "../actions";

interface PairOption {
  pairUid: string;
  teamNameTh: string;
  colorHex: string;
  label: string;
}

type Phase = "idle" | "planning" | "spinning" | "done" | "error";

/** เวลาที่ใช้หมุนก่อนเฉลยแต่ละช่อง (มิลลิวินาที) */
const SPIN_MS = 1400;
const TICK_MS = 70;

export function DrawLottery({
  levelName,
  levelCode,
  pairs,
  describeToken,
  remaining,
}: {
  levelName: string;
  levelCode: string;
  pairs: PairOption[];
  describeToken: (token: string) => string;
  remaining: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ token: string; pairUid: string }[]>([]);
  const [revealed, setRevealed] = useState<{ token: string; pairUid: string }[]>([]);
  const [current, setCurrent] = useState<{ token: string; pairUid: string } | null>(null);
  const [rolling, setRolling] = useState<PairOption | null>(null);
  const cancelled = useRef(false);

  const pairById = new Map(pairs.map((p) => [p.pairUid, p]));

  const close = useCallback(() => {
    cancelled.current = true;
    setOpen(false);
    setPhase("idle");
    setPlan([]);
    setRevealed([]);
    setCurrent(null);
    setRolling(null);
    setError(null);
    router.refresh();
  }, [router]);

  const start = async () => {
    cancelled.current = false;
    setOpen(true);
    setPhase("planning");
    setError(null);
    setRevealed([]);

    const res = await planRandomDrawAction({ levelCode });
    if (cancelled.current) return;
    if (!res.ok) {
      setError(res.error);
      setPhase("error");
      return;
    }
    if (!res.plan?.length) {
      setError("ไม่มีช่องที่ต้องจับสลากแล้ว");
      setPhase("error");
      return;
    }
    setPlan(res.plan);
    setPhase("spinning");
  };

  // เดินทีละช่อง: หมุน → หยุดที่ผลจริง → บันทึก → ช่องถัดไป
  useEffect(() => {
    if (phase !== "spinning") return;
    const next = plan[revealed.length];
    if (!next) {
      setPhase("done");
      setCurrent(null);
      setRolling(null);
      router.refresh();
      return;
    }

    setCurrent(next);
    const pool = pairs.filter((p) => !revealed.some((r) => r.pairUid === p.pairUid));
    const spin = setInterval(() => {
      setRolling(pool[Math.floor(Math.random() * pool.length)] ?? null);
    }, TICK_MS);

    const stop = setTimeout(async () => {
      clearInterval(spin);
      setRolling(pairById.get(next.pairUid) ?? null);
      const saved = await assignDrawAction({ token: next.token, pairUid: next.pairUid });
      if (cancelled.current) return;
      if (!saved.ok) {
        setError(`บันทึกช่อง ${describeToken(next.token)} ไม่สำเร็จ — ${saved.error}`);
        setPhase("error");
        return;
      }
      setRevealed((prev) => [...prev, next]);
    }, SPIN_MS);

    return () => {
      clearInterval(spin);
      clearTimeout(stop);
    };
    // pairById/describeToken สร้างใหม่ทุกเรนเดอร์ ใส่ใน deps จะวนไม่รู้จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealed.length, plan]);

  if (!open) {
    return (
      <button type="button" className="button navy" onClick={start} disabled={remaining === 0}>
        สุ่มจับสลาก {levelName}
        {remaining > 0 ? ` (${remaining} ช่อง)` : " — ครบแล้ว"}
      </button>
    );
  }

  const done = phase === "done";
  return (
    <div className="lottery-backdrop" role="dialog" aria-modal="true" aria-label={`จับสลาก ${levelName}`}>
      <div className="lottery-box">
        <h3 className="lottery-title">จับสลาก {levelName}</h3>

        {phase === "planning" ? <p className="lottery-status">กำลังสุ่ม…</p> : null}

        {phase === "error" ? (
          <>
            <p className="lottery-status" style={{ color: "#b9232e" }}>
              {error}
            </p>
            <button type="button" className="button" onClick={close}>
              ปิด
            </button>
          </>
        ) : null}

        {phase === "spinning" && current ? (
          <>
            <p className="lottery-status">{describeToken(current.token)}</p>
            <div className="lottery-reel" style={{ borderColor: rolling?.colorHex ?? "var(--line)" }}>
              <span className="lottery-team" style={{ color: rolling?.colorHex ?? "var(--muted)" }}>
                {rolling?.teamNameTh ?? "—"}
              </span>
              <b>{rolling?.label ?? "กำลังหมุน…"}</b>
            </div>
            <p className="lottery-count">
              {revealed.length} / {plan.length} ช่อง
            </p>
          </>
        ) : null}

        {done ? (
          <>
            <p className="lottery-status" style={{ color: "#107c41" }}>
              จับสลากครบ {plan.length} ช่องแล้ว
            </p>
            <button type="button" className="button navy" onClick={close}>
              เสร็จสิ้น
            </button>
          </>
        ) : null}

        {revealed.length > 0 ? (
          <ol className="lottery-list">
            {[...revealed].reverse().map((r) => {
              const p = pairById.get(r.pairUid);
              return (
                <li key={r.token}>
                  <span className="lottery-list-slot">{describeToken(r.token)}</span>
                  <span className="lottery-list-pair" style={{ borderColor: p?.colorHex }}>
                    {p?.label ?? r.pairUid}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}

        {!done && phase !== "error" ? (
          <button type="button" className="lottery-cancel" onClick={close}>
            หยุดและปิด (ช่องที่จับไปแล้วยังอยู่)
          </button>
        ) : null}
      </div>
    </div>
  );
}
