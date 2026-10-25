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

// The longest text readSelection accepts, in UTF-16 code units. The lockdown
// truncates a longer selection before sending.
export const READ_SELECTION_MAX_LENGTH = 10000;

// One entry per message type. The remaining feature types (announce,
// examState, getState) each arrive with their own work item; until then they
// answer unknown_type, which is also what an older Herald answers, so the
// lockdown side can gate on the hello types list either way.
const messageHandlers = {
	hello: {
		validate: payload => payload === undefined,
		handle: () => ({version: brapi.runtime.getManifest().version,
																		types: MESSAGE_TYPES})
	},

	// Speaks text the student selected in the exam (WI-B). Herald reads the text
	// in the message and never the tab; tabId only ties the read to its tab, so
	// a stop for that tab can find it.
	readSelection: {
		validate: payload => isPlainObject(payload) &&
			Object.keys(payload).sort().join() == "tabId,text" &&
			isTabId(payload.tabId) &&
			typeof payload.text == "string" && payload.text.length <= READ_SELECTION_MAX_LENGTH && payload.text.trim() != "",
		handle: (payload, actions) => runLater(actions.readSelection, payload.text, payload.tabId)
	},

	// Stops a read the lockdown started from that tab, never a read from
	// another tab and never the student's own reading.
	stop: {
		validate: payload => isPlainObject(payload) && Object.keys(payload).join() == "tabId" && isTabId(payload.tabId),
		handle: (payload, actions) => runLater(actions.stop, payload.tabId)
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
// actions carries what readSelection and stop do; events.js provides them.
export function handleExternalMessage(message, sender, actions = {})
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
																								type: message.type}, handler.handle(message.payload, actions));
	}
	catch (err)
	{
		console.error("lockdown channel", err);

		return failure("internal");
	}
}

// Answers synchronously or not at all. The listener never returns true, so a
// sender that gets no answer is not kept waiting on an open channel.
export function registerExternalMessageListener(actions)
{
	if (!brapi.runtime || !brapi.runtime.onMessageExternal) return;
	brapi.runtime.onMessageExternal.addListener(function(message, sender, sendResponse)
	{
		const answer = handleExternalMessage(message, sender, actions);
		if (answer) sendResponse(answer);
	});
}

// Starts an action after the synchronous answer. The answer means accepted,
// not done: a later failure goes to the console, never to the sender. A
// missing action throws here, so the sender gets internal instead.
function runLater(action, ...args)
{
	if (typeof action != "function") throw new Error("lockdown channel action is not wired");
	Promise.resolve()
		.then(() => action(...args))
		.catch(err => console.error("lockdown channel action", err));

	return {};
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

function isTabId(value)
{
	return Number.isSafeInteger(value) && value >= 0;
}
