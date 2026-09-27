// Stands in for a Proctorio lockdown build in Herald's end-to-end suite. The
// tests call sendToHerald from this worker. e2e/Harness.js gives each copy of
// the stub a key generated for that run, so its ID exists only in test builds.
/**
 * @description Sends one message to Herald and reports what came back.
 *
 * @param {string} heraldId - Herald's extension ID.
 * @param {(Object|Array|string)} message - The message, well formed or not.
 * @return {Promise<Object>} - { response } on delivery (undefined when Herald
 * does not answer), { error } when Chrome cannot deliver it.
 */
self.sendToHerald = async function(heraldId, message)
{
	try
	{
		return { response: await chrome.runtime.sendMessage(heraldId, message) };
	}
	catch (err)
	{
		return { error: err.message };
	}
};
