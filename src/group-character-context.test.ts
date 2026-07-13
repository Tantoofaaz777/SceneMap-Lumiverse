import { describe, expect, test } from "bun:test";
import { resolveMessageCharacterId } from "./group-character-context";

describe("group character context", () => {
  test("uses the assistant message character in a group chat", () => {
    expect(resolveMessageCharacterId(
      {
        character_id: "char-primary",
        metadata: { group: true, character_ids: ["char-primary", "char-focused"] },
      },
      { extra: { character_id: "char-focused" } },
    )).toBe("char-focused");
  });

  test("accepts the numeric group marker used by stored chat metadata", () => {
    expect(resolveMessageCharacterId(
      {
        character_id: "char-primary",
        metadata: { group: 1, character_ids: ["char-primary", "char-focused"] },
      },
      { extra: { character_id: "char-focused" } },
    )).toBe("char-focused");
  });

  test("keeps the primary character outside group chats", () => {
    expect(resolveMessageCharacterId(
      { character_id: "char-primary", metadata: {} },
      { extra: { character_id: "char-other" } },
    )).toBe("char-primary");
  });

  test("falls back for legacy messages and invalid group member ids", () => {
    const chat = {
      character_id: "char-primary",
      metadata: { group: true, character_ids: ["char-primary", "char-focused"] },
    };

    expect(resolveMessageCharacterId(chat, { extra: {} })).toBe("char-primary");
    expect(resolveMessageCharacterId(chat, { extra: { character_id: "not-a-member" } })).toBe("char-primary");
  });
});
