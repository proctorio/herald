import { brapi } from "./brapi.js";
import { LOCKDOWN_ID_HASHES } from "./lockdown-ids.js";
import { sha256Hex } from "./sha256.js";

// The lockdown channel (decision D8, docs/herald/LOCKDOWN-CHANNEL.md). A
// Proctorio lockdown build sends {v, type, payload?} with
// runtime.sendMessage(heraldId, message) and gets exactly one synchronous
// answer: {v, ok: true, type, ...} or {v, ok: false, error: {code}}. Any other
// extension gets no answer at all. The listener never throws and never touches
// a page. Web pages cannot reach it: externally_connectable has no matches.
export const PROTOCOL_VERSION = 1;

const MESSAGE_KEYS = ["v", "type", "payload"];
const EXTENSION_ID = /^[a-p]{32}$/u;

// One entry per message type. Feature types (readSelection, announce,
// examState, getState) each arrive with their own work item; until then they
// answer unknown_type, which is also what an older Herald answers, so the
// lockdown side can gate on the hello types list either way.
const messageHandlers = {
	hello: {
		validate: payload => payload === undefined,
		handle: () => ({version: brapi.runtime.getManifest().version,
																		types: MESSAGE_TYPES})
	}
};

export const MESSAGE_TYPES = Object.freeze(Object.keys(messageHandlers));

// True only for a lockdown build: an extension sender whose ID hashes to an
// entry in LOCKDOWN_ID_HASHES.
export function isLockdownSender(sender)
{
	return Boolean(sender) && typeof sender.id == "string" && EXTENSION_ID.test(sender.id) && LOCKDOWN_ID_HASHES.includes(sha256Hex(sender.id));
}

// The answer for a lockdown build, or null for any other sender: no refusal,
// no error code, nothing that tells an unknown extension what Herald accepts.
export function handleExternalMessage(message, sender)
{
	if (!isLockdownSender(sender)) return null;
	try
	{
		if (!isPlainObject(message)) return failure("malformed");
		if (message.v !== PROTOCOL_VERSION) return failure("unsupported_version");
		if (typeof message.type != "string" || Object.keys(message).some(key => !MESSAGE_KEYS.includes(key))) return failure("malformed");
		if (!Object.hasOwn(messageHandlers, message.type)) return failure("unknown_type");

		const handler = messageHandlers[message.type];
		if (!handler.validate(message.payload)) return failure("malformed");

		return Object.assign({v: PROTOCOL_VERSION,
																								ok: true,
																								type: message.type}, handler.handle(message.payload));
	}
	catch (err)
	{
		console.error("lockdown channel", err);

		return failure("internal");
	}
}

// Answers synchronously or not at all. The listener never returns true, so a
// sender that gets no answer is not kept waiting on an open channel.
export function registerExternalMessageListener()
{
	if (!brapi.runtime || !brapi.runtime.onMessageExternal) return;
	brapi.runtime.onMessageExternal.addListener(function(message, sender, sendResponse)
	{
		const answer = handleExternalMessage(message, sender);
		if (answer) sendResponse(answer);
	});
}

function failure(code)
{
	return {v: PROTOCOL_VERSION,
									ok: false,
									error: {code: code}};
}

function isPlainObject(value)
{
	return value !== null && typeof value == "object" && Object.getPrototypeOf(value) === Object.prototype;
}
