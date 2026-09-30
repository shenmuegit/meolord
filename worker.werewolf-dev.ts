export { WerewolfRoom } from "./src/server/werewolf/room";

const worker = { fetch: () => new Response(null, { status: 404 }) };
export default worker;
