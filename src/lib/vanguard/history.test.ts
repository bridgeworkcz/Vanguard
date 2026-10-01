import assert from "node:assert/strict";
import test from "node:test";
import { HISTORY_COUNT, buildHistoryBoard, largestRemainder } from "./history.ts";

const rows = buildHistoryBoard("2026-10-02");

function nameOf(raw: string) {
  const data = JSON.parse(raw) as { history?: boolean; questionnaire?: { firstName?: string; lastName?: string }; citizenship?: string };
  return data;
}

test("board is a stable set of 2219 unique cases", () => {
  assert.equal(rows.length, HISTORY_COUNT);
  assert.deepEqual(buildHistoryBoard("2026-10-02").map((row) => row.id), rows.map((row) => row.id));
  assert.equal(new Set(rows.map((row) => row.id)).size, HISTORY_COUNT);
  const names = rows.map((row) => {
    const data = nameOf(row.applicantData);
    return `${data.questionnaire?.firstName} ${data.questionnaire?.lastName}`;
  });
  assert.equal(new Set(names).size, HISTORY_COUNT);
  assert.equal(names.some((name) => name.includes("undefined")), false);
});

test("dates run from March 2024 through the frozen day", () => {
  for (const row of rows) {
    assert.ok(row.createdAt >= "2024-03-01");
    assert.ok(row.createdAt.slice(0, 10) <= "2026-10-02");
    assert.equal(row.userId, "");
    assert.equal(row.vacancyId, "");
    assert.equal(nameOf(row.applicantData).history, true);
    assert.notEqual(row.country, nameOf(row.applicantData).citizenship);
  }
  assert.ok(rows.some((row) => row.createdAt.startsWith("2024-03")));
  assert.ok(rows.some((row) => row.createdAt.startsWith("2026-10")));
});

test("finished cases before August 2026 and the later mix from August", () => {
  const historical = rows.filter((row) => row.createdAt.slice(0, 10) < "2026-08-01");
  const recent = rows.filter((row) => row.createdAt.slice(0, 10) >= "2026-08-01");
  assert.equal(historical.length + recent.length, HISTORY_COUNT);
  assert.ok(historical.length > recent.length);

  const [issued, refused, stuck] = largestRemainder(historical.length, [65, 20, 15]);
  assert.equal(historical.filter((row) => row.status === "ISSUED" && row.stage === "4").length, issued);
  assert.equal(historical.filter((row) => row.status === "REJECTED").length, refused);
  const open = historical.filter((row) => row.status === "OPEN");
  assert.equal(open.length, stuck);
  assert.equal(open.filter((row) => row.stage === "3").length, Math.ceil((stuck ?? 0) / 2));
  assert.equal(open.filter((row) => row.stage === "4").length, Math.floor((stuck ?? 0) / 2));

  const [visa, moving, early] = largestRemainder(recent.length, [40, 40, 20]);
  assert.equal(recent.filter((row) => row.status === "ISSUED").length, visa);
  const mid = recent.filter((row) => row.status === "OPEN" && (row.stage === "3" || row.stage === "4"));
  const start = recent.filter((row) => row.status === "OPEN" && (row.stage === "1" || row.stage === "2"));
  assert.equal(mid.length, moving);
  assert.equal(start.length, early);
  assert.equal(mid.filter((row) => row.stage === "3").length, Math.ceil((moving ?? 0) / 2));
  assert.equal(start.filter((row) => row.stage === "1").length, Math.ceil((early ?? 0) / 2));
});
