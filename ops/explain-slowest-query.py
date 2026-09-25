#!/usr/bin/env python3
"""EXPLAIN the slowest logged statement (staging perf work, 2026-09-25).

Reads Postgres log lines (log_min_duration_statement) from stdin, picks the
slowest `execute` statement whose text matches --match, substitutes its
`DETAIL: Parameters:` values and runs EXPLAIN (ANALYZE, BUFFERS) through
`docker exec <container> psql`. Prints a compact plan (node lines only).

  docker logs --since 5m <pg> 2>&1 | python3 ops/explain-slowest-query.py \
      --container <pg> --db ephelpdesk-dev --user admin --match ILIKE

Read-only: EXPLAIN ANALYZE executes the statement, so only SELECTs are run.
"""
import argparse
import re
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--container", required=True)
parser.add_argument("--db", default="ephelpdesk-dev")
parser.add_argument("--user", default="admin")
parser.add_argument("--match", default="", help="substring the SQL must contain")
parser.add_argument("--full", action="store_true", help="print the whole plan")
args = parser.parse_args()

statement_re = re.compile(r"duration: ([0-9.]+) ms\s+execute [^:]*: (.*)$")
params_re = re.compile(r"DETAIL:\s+Parameters: (.*)$")
param_re = re.compile(r"\$(\d+) = (NULL|'(?:[^']|'')*')")

best = None  # (duration, sql, params)
pending = None
for raw in sys.stdin:
    line = raw.rstrip("\n")
    m = statement_re.search(line)
    if m:
        pending = (float(m.group(1)), m.group(2))
        continue
    p = params_re.search(line)
    if p and pending is not None:
        duration, sql = pending
        pending = None
        if not sql.lstrip().upper().startswith("SELECT"):
            continue
        if args.match and args.match.lower() not in sql.lower():
            continue
        if best is None or duration > best[0]:
            best = (duration, sql, dict(param_re.findall(p.group(1))))

if best is None:
    sys.exit("Nema SELECT upita s parametrima koji odgovara --match (je li log_min_duration_statement bio uključen?)")

duration, sql, params = best
# Replace from the highest index down so $1 does not clobber $10.
for index in sorted(params, key=int, reverse=True):
    sql = sql.replace(f"${index}", params[index])

print(f"-- najsporiji: {duration:.0f} ms, {len(params)} parametara")
result = subprocess.run(
    ["docker", "exec", "-i", args.container, "psql", "-U", args.user, "-d", args.db,
     "-X", "-q", "-c", f"EXPLAIN (ANALYZE, BUFFERS) {sql}"],
    capture_output=True, text=True,
)
if result.returncode != 0:
    sys.exit(result.stderr.strip())
for plan_line in result.stdout.splitlines():
    stripped = plan_line.strip()
    if args.full or "->" in stripped or stripped.startswith(("Limit", "Aggregate", "Sort", "Execution Time", "Planning Time", "Index", "Seq Scan", "Bitmap")) or "Filter" in stripped or "rows=" in stripped and "Scan" in stripped:
        print(plan_line[:220])
