import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useDialogueManager } from "./useDialogueManager";
import type { Player } from "@/vendor/wolfcha/types/game";

test("上一位流式发言完成前不能切换玩家", () => {
  let dialogue!: ReturnType<typeof useDialogueManager>;
  function Capture() {
    // eslint-disable-next-line react-hooks/globals -- capture the server-rendered hook for this queue check
    dialogue = useDialogueManager();
    return null;
  }
  renderToString(createElement(Capture));

  const player = { playerId: "1", seat: 0, displayName: "一号" } as Player;
  dialogue.initStreamingSpeechQueue(player);
  dialogue.appendToSpeechQueue("第一段", undefined, 0);
  dialogue.markCurrentSegmentCompleted();
  assert.equal(dialogue.advanceSpeechQueue()?.waiting, true);
  dialogue.appendToSpeechQueue("第二段", undefined, 1);
  dialogue.markCurrentSegmentCompleted();
  assert.equal(dialogue.advanceSpeechQueue()?.waiting, true);
  dialogue.finalizeSpeechQueue();
  assert.equal(dialogue.advanceSpeechQueue()?.finished, true);
});
