import assert from "node:assert/strict";
import test from "node:test";
import { canCancel, citizenshipBlocked, dueWithinHours, isOverdue, trancheSplit } from "./ops.ts";

test("tranches add up to the fee", () => {
  const parts = trancheSplit(1000);
  assert.equal(parts[0].amount + parts[1].amount + parts[2].amount, 1000);
  assert.deepEqual(parts.map((part) => part.percent), [30, 40, 30]);
});

test("citizenship block is case-insensitive", () => {
  assert.equal(citizenshipBlocked("Ukraine, Poland", "ukraine"), true);
  assert.equal(citizenshipBlocked("Ukraine", "Czechia"), false);
});

test("reminders and cancel window", () => {
  const soon = new Date(Date.now() + 10 * 36e5).toISOString();
  const later = new Date(Date.now() + 48 * 36e5).toISOString();
  const past = new Date(Date.now() - 36e5).toISOString();
  assert.equal(dueWithinHours(soon, 24), true);
  assert.equal(dueWithinHours(later, 24), false);
  assert.equal(isOverdue(past), true);
  assert.equal(canCancel("OPEN", 2, soon, false), true);
  assert.equal(canCancel("OPEN", 2, past, false), false);
  assert.equal(canCancel("OPEN", 2, soon, true), false);
});
