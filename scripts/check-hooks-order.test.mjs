// Tests for the conditional-hooks guard (2026-10-03 React #310 on the ticket
// detail page). Each case is the smallest snippet that shows the rule, and the
// negatives are the shapes that must NOT be flagged, so the guard stays usable
// as a CI gate.
import assert from "node:assert/strict";
import { test } from "node:test";
import { skippedHooksIn } from "./check-hooks-order.mjs";

test("flags a hook that the loading return skips", () => {
  const source = `
    export function Page() {
      const [ticket, setTicket] = useState(null);
      if (ticket === null) {
        return <p>Loading</p>;
      }
      const sections = useTicketDetailSections();
      return <p>{sections}</p>;
    }
  `;
  assert.deepEqual(skippedHooksIn(source), [{ line: 7, hooks: ["useTicketDetailSections"] }]);
});

test("flags a hook after an early return inside a custom hook", () => {
  const source = `
    export function useThing(enabled: boolean) {
      const [value, setValue] = useState(0);
      if (!enabled) return null;
      const doubled = useMemo(() => value * 2, [value]);
      return doubled;
    }
  `;
  assert.deepEqual(skippedHooksIn(source), [{ line: 5, hooks: ["useMemo"] }]);
});

test("allows hooks above the early return, callbacks and other functions", () => {
  const source = `
    export function Fine({ ticket }: { ticket: Ticket | null }) {
      const [open, setOpen] = useState(false);
      const label = useMemo(() => ticket?.title ?? "", [ticket]);
      useEffect(() => {
        if (!open) return;
        setOpen(false);
      }, [open]);
      if (ticket === null) {
        return null;
      }
      const rows = ticket.items.map((item) => {
        if (!item.visible) return null;
        return item.id;
      });
      helpers.useSomethingElse();
      return <p>{label}{rows.length}</p>;
    }
    export function NotAHook() {
      const usefulThing = () => 1;
      if (usefulThing() === 2) return null;
      return <p>{usefulThing()}</p>;
    }
  `;
  assert.deepEqual(skippedHooksIn(source), []);
});
