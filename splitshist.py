#!/usr/bin/env python3
"""Write site/data/splitshist.json - this week's line-movement history.

The site draws line movement from this. It used to reach the browser only via
sync_site.py pushing into the Claude-hosted copy's database; this makes it an
ordinary JSON file alongside everything else in site/data/, so the self-hosted
site has it too.

Only the current week's games are included, and only the most recent snapshots
per game, to keep the file small enough to fetch on every page load.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
D = HERE / "site" / "data"
HIST = HERE / "data" / "splits_history"
KEEP = 80


def main():
    trends = json.loads((D / "trends.json").read_text())
    week = trends["next_week"]
    ids = {g["game_id"] for g in trends.get("week_games", [])} | {
        g["game_id"] for g in trends.get("season_games", []) if g.get("week") == week
    }

    out = {}
    for gid in sorted(ids):
        f = HIST / f"{gid}.json"
        if not f.exists():
            continue
        snaps = json.loads(f.read_text()).get("snaps", [])
        snaps = [s for s in snaps if s.get("ts") != "backfill"][-KEEP:]
        if snaps:
            out[gid] = {"snaps": snaps}

    D.mkdir(parents=True, exist_ok=True)
    path = D / "splitshist.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    total = sum(len(v["snaps"]) for v in out.values())
    print(f"splitshist: week {week}, {len(out)} games, {total} snapshots, "
          f"{path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
