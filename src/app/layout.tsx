import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getTournamentSnapshot, type TournamentSnapshot } from "@/lib/tournament";
import { SnapshotProvider } from "@/components/snapshot-provider";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "การแข่งขันแบดมินตัน กีฬาภายใน ทอท. 2569",
  description: "ตารางแข่งขัน ผลแต่ละคอร์ต สายการแข่งขัน และคะแนนสีของทั้ง 4 สี แบบเรียลไทม์",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "การแข่งขันแบดมินตัน กีฬาภายใน ทอท. 2569",
    description: "ติดตามผลการแข่งขันและคะแนนสีแบบเรียลไทม์",
    images: ["/og.png"],
    type: "website",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#061f46",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let snapshot: TournamentSnapshot | null = null;
  let loadError: string | null = null;
  try {
    snapshot = await getTournamentSnapshot();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ";
  }

  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {snapshot ? (
          <SnapshotProvider initial={snapshot}>
            <SiteHeader />
            {children}
            <footer className="site-footer">
              <div className="shell">
                หน้าสาธารณะแสดงผลอย่างเดียว · การแก้ไขผลทำได้เฉพาะผู้ดูแลที่ได้รับสิทธิ์ และถูกบันทึกไว้ทุกครั้ง
                <br />
                บริษัท ท่าอากาศยานไทย จำกัด (มหาชน) · กีฬาภายใน ทอท. ประจำปี 2569
              </div>
            </footer>
          </SnapshotProvider>
        ) : (
          <main className="page-shell shell" style={{ maxWidth: 720 }}>
            <div className="panel">
              <h1 style={{ marginTop: 0 }}>ยังใช้งานไม่ได้</h1>
              <p style={{ color: "var(--muted)" }}>{loadError}</p>
              <ol style={{ color: "var(--muted)", fontSize: 14 }}>
                <li>
                  ตั้งค่า <code>DATABASE_URL</code> ในไฟล์ <code>.env</code>
                </li>
                <li>
                  รัน <code>npm run db:push</code> แล้ว <code>npm run db:seed</code>
                </li>
              </ol>
            </div>
          </main>
        )}
      </body>
    </html>
  );
}
