// @ts-expect-error OpenNext generates this file during the Cloudflare build.
import handler from "./.open-next/worker.js";

export { WerewolfRoom } from "./src/server/werewolf/room";

const worker = { fetch: handler.fetch };
export default worker;
