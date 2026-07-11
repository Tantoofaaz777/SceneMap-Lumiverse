import { describe, expect, test } from "bun:test";
import { KeyedAsyncQueue } from "./keyed-async-queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("KeyedAsyncQueue", () => {
  test("runs tasks for the same key strictly in enqueue order", async () => {
    const queue = new KeyedAsyncQueue();
    const gate = deferred();
    const started = deferred();
    const events: string[] = [];

    const first = queue.enqueue("user-1", async () => {
      events.push("first:start");
      started.resolve();
      await gate.promise;
      events.push("first:end");
    });
    const second = queue.enqueue("user-1", async () => {
      events.push("second:start");
    });

    await started.promise;
    expect(events).toEqual(["first:start"]);
    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  test("does not let a failed task block later tasks", async () => {
    const queue = new KeyedAsyncQueue();
    const first = queue.enqueue("user-1", async () => {
      throw new Error("state failed");
    });
    const second = queue.enqueue("user-1", async () => "state sent");

    await expect(first).rejects.toThrow("state failed");
    await expect(second).resolves.toBe("state sent");
  });

  test("allows different users to progress independently", async () => {
    const queue = new KeyedAsyncQueue();
    const gate = deferred();
    const blocked = queue.enqueue("user-1", async () => gate.promise);

    await expect(queue.enqueue("user-2", async () => "ready")).resolves.toBe("ready");
    gate.resolve();
    await blocked;
  });
});
