import assert from "node:assert/strict";
import test from "node:test";
import { createConversationService } from "../server/conversation-service.mjs";

const message = (blocks) => ({ id: "answer", role: "assistant", text: "Done", blocks });

test("enriches app-server messages with media captured from JSONL", async () => {
  const primary = {
    findSession: async () => ({ threadId: "thread", messages: [message([{ id: "text", type: "markdown", text: "Done" }])] }),
    close: () => {},
  };
  const fallback = {
    findSession: async () => ({ threadId: "thread", messages: [{
      ...message([
        { id: "text", type: "markdown", text: "Done" },
        { id: "image", type: "image", source: "data:image/png;base64,AAAA" },
      ]),
      createdAt: "2026-08-01T09:38:20.165Z",
    }] }),
    close: () => {},
  };
  const service = createConversationService({ primary, fallback });

  const session = await service.findSession("thread");
  assert.deepEqual(session.messages[0].blocks.map((block) => block.type), ["markdown", "image"]);
  assert.equal(session.messages[0].createdAt, "2026-08-01T09:38:20.165Z");
  service.close();
});
