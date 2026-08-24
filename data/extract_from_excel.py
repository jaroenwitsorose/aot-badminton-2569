# -*- coding: utf-8 -*-
"""แปลง AOT_Badminton_2569_Production_Data.xlsx -> data/seed-data.json

รันใหม่ได้ทุกครั้งที่ไฟล์ Excel เปลี่ยน:
    py data/extract_from_excel.py [path.xlsx]
"""
import openpyxl, json, sys, os, re

DEFAULT_XLSX = r"C:\Users\Nui_PC\OneDrive - Airports of Thailand Public Company Limited [AOT]\Documents\AOT_Badminton_2569_Production_Data.xlsx"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed-data.json")


def table(wb, name, hdr_row=4):
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(c).strip() if c is not None else "" for c in rows[hdr_row - 1]]
    out = []
    for r in rows[hdr_row:]:
        if all(c is None or str(c).strip() == "" for c in r):
            continue
        out.append({hdr[i]: r[i] for i in range(len(hdr)) if hdr[i]})
    return out


def s(v):
    """เซลล์ว่าง -> None ; อย่างอื่น -> str ที่ trim แล้ว"""
    if v is None:
        return None
    t = str(v).strip()
    return t if t != "" else None


def i(v):
    return int(v) if v is not None and str(v).strip() != "" else None


def code(v):
    """เหมือน s() แต่ล้างเลข 0 ทิ้งด้วย

    แถว 187-188 ของชีต Participants_184 (PAIR-L4-BLU-03-P1/P2) กรอกเลข 0
    ไว้ในช่อง public_pair_code / display_code / event_type ที่แถวอื่นเว้นว่าง
    ถือเป็นเซลล์ว่างที่พิมพ์ผิด ไม่ใช่ค่าจริง
    """
    t = s(v)
    return None if t == "0" else t


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    wb = openpyxl.load_workbook(path, data_only=True)

    tour_rows = table(wb, "Tournament")
    tour = {str(r["field"]): r["value"] for r in tour_rows if r.get("field")}
    # ชีต Tournament มีคอลัมน์ status: PENDING = ค่าที่กรอกไว้ยังไม่ใช่ข้อสรุป
    tour_status = {str(r["field"]): s(r.get("status")) for r in tour_rows if r.get("field")}

    teams = [
        {
            "teamCode": s(r["team_code"]),
            "nameTh": s(r["team_name_th"]),
            "displayOrder": i(r["display_order"]),
            "colorHex": s(r["color_hex"]),
        }
        for r in table(wb, "Teams")
    ]

    levels = [
        {
            "levelCode": s(r["level_code"]),
            "nameTh": s(r["level_name_th"]),
            "eligibility": s(r["eligibility"]),
            "pairSlots": i(r["pair_slots"]),
            "matchCount": i(r["match_count"]),
            "format": s(r["format"]),
            "eventTypes": s(r["event_types"]),
            "teamTieSize": i(r["team_tie_size"]),
        }
        for r in table(wb, "Levels")
    ]

    pairs = [
        {
            "pairUid": s(r["pair_uid (ห้ามเปลี่ยน)"]),
            "levelCode": s(r["level_code"]),
            "teamCode": s(r["team_code"]),
            "slotNo": i(r["slot_no"]),
            "eventType": code(r["event_type"]),
            "publicPairCode": code(r["public_pair_code"]),
            "player1Template": s(r["player1_display_template"]),
            "player2Template": s(r["player2_display_template"]),
        }
        for r in table(wb, "Pairs_92")
    ]

    participants = [
        {
            "participantUid": s(r["participant_uid"]),
            "pairUid": s(r["pair_uid"]),
            "playerNo": i(r["player_no"]),
            "displayCode": code(r["display_code"]),
            "actualName": s(r["actual_name"]),
            "employeeId": s(r["employee_id"]),
            "teamCode": s(r["team_code"]),
            "levelCode": s(r["level_code"]),
            "eventType": code(r["event_type"]),
            "skillRank": code(r["skill_rank"]),
            "gender": code(r["gender"]),
        }
        for r in table(wb, "Participants_184")
    ]

    matches = []
    for r in table(wb, "Matches_158"):
        side_a = s(r["side_a_source"])
        phase = s(r["phase"])
        # กลุ่ม A-D อ่านจาก token เช่น GROUP:L2:A:SLOT1 -> "A"
        group_key = side_a.split(":")[2] if phase == "GROUP_STAGE" else None
        # คู่ที่เท่าไรของคู่สี อ่านจาก LINEUP:L4:T01:PUR:ORDER1 -> 1
        tie_order = (
            int(side_a.split(":")[4].replace("ORDER", ""))
            if side_a.startswith("LINEUP:")
            else None
        )
        matches.append(
            {
                "matchNo": i(r["match_no"]),
                "matchUid": s(r["match_uid"]),
                "sourceMatchCode": s(r["source_match_code"]),
                "dayNo": i(r["day_no"]),
                "startTime": s(r["start_time"]),
                "endTime": s(r["end_time"]),
                "courtNo": i(r["court_no"]),
                "levelCode": s(r["level_code"]),
                "eventType": code(r["event_type"]),
                "phase": phase,
                "bracket": s(r["bracket"]),
                "roundLabel": s(r["round_label"]),
                "groupKey": group_key,
                "tieId": s(r["tie_id"]),
                "tieOrderNo": tie_order,
                "sideASource": side_a,
                "sideBSource": s(r["side_b_source"]),
            }
        )

    ties = [
        {
            "tieId": s(r["tie_id"]),
            "tieNo": i(r["tie_no"]),
            "phase": s(r["phase"]),
            "stage": s(r["stage"]),
            "dayNo": i(r["day_no"]),
            "startTime": s(r["start_time"]),
            "courts": s(r["courts"]),
            "teamASource": s(r["team_a_source"]),
            "teamBSource": s(r["team_b_source"]),
            "matchNos": [int(x) for x in str(r["match_nos"]).split(",")],
            "requiredMatchWins": i(r["required_match_wins"]),
            "playAllThree": str(r["play_all_three"]) == "True",
        }
        for r in table(wb, "L4_Ties")
    ]

    scoring = []
    for r in table(wb, "Color_Scoring"):
        lv = s(r.get("level_code"))
        if not lv or not lv.startswith("LEVEL"):
            continue
        result = s(r["result"])
        rank_m = re.match(r"^อันดับ (\d+)$", result or "")
        scoring.append(
            {
                "levelCode": lv,
                "category": s(r["category"]),
                "result": result,
                "rankNo": int(rank_m.group(1)) if rank_m else None,
                "points": float(r["counted_points"] or 0),
                "medal": s(r["medal"]),
                "countsTowardTotal": str(r["counts_toward_total"]) == "True",
                "note": s(r["note"]),
            }
        )

    enums = {}
    for r in table(wb, "Validation_Lists"):
        enums.setdefault(s(r["group"]), []).append(
            {"code": s(r["code"]), "displayTh": s(r["display_th"]), "note": s(r["note"])}
        )

    checklist = [
        {
            "area": s(r["area"]),
            "item": s(r["check_item"]),
            "owner": s(r["owner"]),
            "status": s(r["status"]),
            "blocking": s(r["blocking"]) == "Y",
            "note": s(r["note"]),
        }
        for r in table(wb, "Production_Check")
    ]

    data = {
        "tournament": {
            "tournamentId": s(tour.get("tournament_id")),
            "titleTh": s(tour.get("title_th")),
            "yearBe": i(tour.get("year_be")),
            "timezone": s(tour.get("timezone")) or "Asia/Bangkok",
            "startDate": s(tour.get("start_date")),
            "endDate": s(tour.get("end_date")),
            "venue": s(tour.get("venue")),
            # "สทย. หรือ สโมสรท่าอากาศยาน" เป็นตัวเลือกที่ยังไม่ตัดสิน ไม่ใช่สถานที่ที่ยืนยันแล้ว
            "venueConfirmed": tour_status.get("venue") == "READY",
            "publicRefreshMs": i(tour.get("public_refresh_ms")) or 3000,
            "registrationMode": s(tour.get("registration_mode")),
            "reportingMinutesBefore": i(tour.get("reporting_minutes_before")),
            "walkoverGraceMinutes": i(tour.get("walkover_grace_minutes")),
            "walkoverScore": s(tour.get("walkover_score")),
        },
        "teams": teams,
        "levels": levels,
        "pairs": pairs,
        "participants": participants,
        "matches": matches,
        "ties": ties,
        "scoring": scoring,
        "enums": enums,
        "checklist": checklist,
    }

    # ---- ตรวจความครบถ้วนก่อนเขียนไฟล์ (ผิดแล้วหยุดทันที) ----
    assert len(pairs) == 92, f"pairs={len(pairs)}"
    assert len(participants) == 184, f"participants={len(participants)}"
    assert len(matches) == 158, f"matches={len(matches)}"
    assert len(ties) == 10, f"ties={len(ties)}"
    assert [m["matchNo"] for m in matches] == list(range(1, 159)), "match_no ไม่เรียง 1-158"
    total = sum(x["points"] for x in scoring if x["countsTowardTotal"])
    assert abs(total - 37.0) < 1e-9, f"คะแนนสีรวม = {total} (ต้องเป็น 37)"
    codes = {m["sourceMatchCode"] for m in matches}
    for m in matches:
        for side in ("sideASource", "sideBSource"):
            mm = re.match(r"^(WINNER|LOSER):(.+)$", m[side] or "")
            assert not mm or mm.group(2) in codes, f"อ้างอิงไม่พบ: {m[side]}"
    valid_events = {"MD", "WD", "XD", None}
    for coll, name in ((pairs, "pairs"), (participants, "participants"), (matches, "matches")):
        bad = [x for x in coll if x["eventType"] not in valid_events]
        assert not bad, f"{name}: event_type ไม่ถูกต้อง {bad[:2]}"
    valid_ranks = {"NEW", "D", "C", "B-", "B+", "A", "S", None}
    bad_rank = [x for x in participants if x["skillRank"] not in valid_ranks]
    assert not bad_rank, f"skill_rank ไม่ถูกต้อง {bad_rank[:2]}"
    bad_gender = [x for x in participants if x["gender"] not in {"M", "F", "ชาย", "หญิง", None}]
    assert not bad_gender, f"gender ไม่ถูกต้อง {bad_gender[:2]}"

    tie_nos = [n for t in ties for n in t["matchNos"]]
    assert len(tie_nos) == 30 and len(set(tie_nos)) == 30, "match_nos ของคู่สีซ้ำหรือขาด"
    assert all(
        m["groupKey"] in ("A", "B", "C", "D")
        for m in matches
        if m["phase"] == "GROUP_STAGE"
    ), "อ่านชื่อกลุ่มไม่ได้"
    assert all(
        m["tieOrderNo"] in (1, 2, 3) for m in matches if m["levelCode"] == "LEVEL4"
    ), "อ่านลำดับคู่ของคู่สีไม่ได้"
    # ไม่มีแมตช์ไหนอ้างถึงแมตช์ที่ยังไม่แข่ง (การันตีว่าคำนวณจบใน pass เดียวได้)
    order = {m["sourceMatchCode"]: m["matchNo"] for m in matches}
    for m in matches:
        for side in ("sideASource", "sideBSource"):
            mm = re.match(r"^(WINNER|LOSER):(.+)$", m[side] or "")
            if mm:
                assert order[mm.group(2)] < m["matchNo"], f"อ้างถึงแมตช์ที่ยังไม่แข่ง: {m[side]}"

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("เขียน " + OUT)
    print(
        f"  teams={len(teams)} levels={len(levels)} pairs={len(pairs)} "
        f"participants={len(participants)} matches={len(matches)} ties={len(ties)} "
        f"scoring={len(scoring)} checklist={len(checklist)}"
    )
    print(f"  คะแนนสีรวม = {total}")


if __name__ == "__main__":
    main()
