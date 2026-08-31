"use client";

/**
 * ดึงข้อมูลสดให้ทุกหน้าสาธารณะ
 *
 * - รีเฟรชตามค่า public_refresh_ms ของการแข่งขัน (ค่าเริ่มต้น 3 วินาที)
 * - หยุดดึงเมื่อผู้ใช้สลับแท็บออกไป เพื่อไม่ให้เปลืองเน็ตในสนาม
 * - เน็ตหลุดแล้วยังแสดงข้อมูลล่าสุดที่มีอยู่ พร้อมบอกว่าข้อมูลค้างตั้งแต่เมื่อไร
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TournamentSnapshot } from "@/lib/tournament";

interface SnapshotContextValue {
  snapshot: TournamentSnapshot;
  isStale: boolean;
  lastSyncedAt: Date;
  refresh: () => void;
}

const SnapshotContext = createContext<SnapshotContextValue | null>(null);

export function SnapshotProvider({
  initial,
  children,
}: {
  initial: TournamentSnapshot;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());
  const [isStale, setIsStale] = useState(false);
  const inFlight = useRef(false);
  /** ป้ายกำกับของข้อมูลชุดที่ถืออยู่ ส่งกลับไปให้เซิร์ฟเวอร์เทียบว่าเปลี่ยนหรือยัง */
  const etag = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/public/snapshot", {
        cache: "no-store",
        headers: etag.current ? { "if-none-match": etag.current } : undefined,
      });

      // 304 = ผลยังไม่เปลี่ยนตั้งแต่ครั้งก่อน เซิร์ฟเวอร์ไม่ส่งข้อมูลกลับมาเลย
      // ของที่ถืออยู่ยังใหม่อยู่ แค่บันทึกว่าเพิ่งเช็กไปเมื่อไร
      if (res.status === 304) {
        setLastSyncedAt(new Date());
        setIsStale(false);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));

      etag.current = res.headers.get("etag");
      setSnapshot((await res.json()) as TournamentSnapshot);
      setLastSyncedAt(new Date());
      setIsStale(false);
    } catch {
      setIsStale(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = Math.max(1000, snapshot.tournament.publicRefreshMs);
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(refresh, interval);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, snapshot.tournament.publicRefreshMs]);

  return (
    <SnapshotContext.Provider value={{ snapshot, isStale, lastSyncedAt, refresh: () => void refresh() }}>
      {children}
    </SnapshotContext.Provider>
  );
}

export function useSnapshot(): SnapshotContextValue {
  const ctx = useContext(SnapshotContext);
  if (!ctx) throw new Error("useSnapshot ต้องอยู่ภายใน SnapshotProvider");
  return ctx;
}
