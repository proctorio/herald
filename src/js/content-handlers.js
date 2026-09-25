import { brapi } from "./brapi.js";
import { config } from "./defaults.js";

export var contentHandlers = [
	// Unsupported Sites --------------------------------------------------------
	{
		match: function(url) 
		{
			return config.unsupportedSites.some(function(site) 
			{
				return (typeof site == "string" && url.startsWith(site)) || (site instanceof RegExp && site.test(url));
			});
		},
		validate: function() 
		{
			throw new Error(JSON.stringify({code: "error_page_unreadable"}));
		}
	},

	// file:// ------------------------------------------------------------------
	{
		match: function(url) 
		{
			return (/^file:/).test(url);
		},
		validate: function() 
		{
			return new Promise(function(fulfill) 
			{
				brapi.extension.isAllowedFileSchemeAccess(fulfill);
			})
				.then(function(allowed) 
				{
					if (!allowed) throw new Error(JSON.stringify({code: "error_file_access"}));
				});
		}
	},

	// Google Docs ---------------------------------------------------------------
	{
		match: function(url) 
		{
			return url.startsWith("https://docs.google.com/document/d/");
		},
		validate: function() 
		{
			if (this.alreadyAsked) return;
			else this.alreadyAsked = true;
			const perms = {
				origins: ["https://docs.google.com/document/d/"]
			};
			
			return brapi.permissions.contains(perms)
				.then(has => 
				{
					if (!has) throw new Error(JSON.stringify({code: "error_add_permissions",
																																															perms: perms,
																																															reload: true}));
				});
		}
	},

	// OneDrive Doc -----------------------------------------------------------
	{
		match: function(url, title) 
		{
			return url.startsWith("https://onedrive.live.com/edit.aspx") && title.includes(".docx") ||
        (/^https:\/\/[^/]+\.sharepoint\.com\//).test(url) ||
        url.startsWith("https://www.dropbox.com/") && url.split("?")[0].endsWith(".docx");
		},
		targetOrigins: [
			"https://word-edit.officeapps.live.com/",
			"https://usc-word-edit.officeapps.live.com/"
		],
		validate: function() 
		{
			var perms = {
				permissions: ["webNavigation"],
				origins: this.targetOrigins
			};
			
			return brapi.permissions.contains(perms)
				.then(function(has) 
				{
					if (!has) throw new Error(JSON.stringify({code: "error_add_permissions",
																																															perms: perms}));
				});
		},
		getFrameId: function(frames) 
		{
			const frame = frames.find(frame => this.targetOrigins.some(origin => frame.url.startsWith(origin)));
			
			return frame && frame.frameId;
		},
		extraScripts: ["js/content/onedrive-doc.js"]
	},

	// Liberty University ---------------------------------------------------------
	{
		match: function(url) 
		{
			return url.startsWith("https://luoa.instructure.com/courses/");
		},
		validate: function() 
		{
			var perms = {
				permissions: ["webNavigation"],
				origins: ["https://luoa-content.s3.amazonaws.com/"]
			};
			
			return brapi.permissions.contains(perms)
				.then(function(has) 
				{
					if (!has) throw new Error(JSON.stringify({code: "error_add_permissions",
																																															perms: perms}));
				});
		},
		getFrameId: function(frames) 
		{
			var frame = frames.find(function(frame) 
			{
				return frame.url && frame.url.startsWith("https://luoa-content.s3.amazonaws.com/");
			});
			
			return frame && frame.frameId;
		}
	},

	// Canvas LMS ---------------------------------------------------------------
	// Classic quizzes render in the top frame; New Quizzes render in a
	// cross-origin LTI tool frame, so course and quiz pages need webNavigation
	// to resolve that frame plus the instructure origins to inject into it.
	{
		match: function(url)
		{
			// Quiz surfaces only. Ordinary course pages (wiki, files, pages)
			// keep the default handler and activeTab, with no permission prompt.
			// New Quizzes launched through assignment URLs are a known gap for
			// the live Canvas pass in the QA matrix.
			return (/^https:\/\/[^/]+\.instructure\.com\//).test(url) &&
				(/\/(quizzes|assessments)([#/?]|$|\/)/).test(url);
		},
		targetOrigins: ["https://*.instructure.com/"],

		// Classic quizzes render in the top frame, which the toolbar click's
		// activeTab grant already covers: no permission prompt, no frame
		// lookup. Only a page that actually embeds the New Quizzes tool frame
		// (cross-origin, so outside activeTab) needs the optional permissions.
		// Gating every quiz URL made Classic quizzes unreadable without a
		// prompt a locked-down exam may never allow (live Canvas pass,
		// 2026-09-25). The probe runs in the top frame, which activeTab
		// covers, and only reads iframe attributes.
		needsFrames: function(tab)
		{
			return brapi.scripting.executeScript({
				target: {tabId: tab.id},
				func: pageHasQuizToolFrame
			})
				.then(function(results)
				{
					return Boolean(results && results[0] && results[0].result);
				});
		},
		validate: function(tab)
		{
			var perms = {
				permissions: ["webNavigation"],
				origins: this.targetOrigins
			};

			return this.needsFrames(tab)
				.then(function(needed)
				{
					if (!needed) return true;

					return brapi.permissions.contains(perms);
				})
				.then(function(has)
				{
					if (!has) throw new Error(JSON.stringify({code: "error_add_permissions",
																																															perms: perms}));
				});
		},
		getFrameId: function(frames)
		{
			var topFrame = frames.find(function(frame)
			{
				return frame.frameId == 0;
			});
			var topHost = topFrame && topFrame.url ? getHostname(topFrame.url) : "";
			var frame = frames.find(function(frame)
			{
				if (!frame.url || frame.frameId == 0) return false;
				var host = getHostname(frame.url);

				return host != topHost && (host.includes("quiz-lti") || host.endsWith(".instructure.com"));
			});

			return frame && frame.frameId;
		}
	},

	// default -------------------------------------------------------------------
	{
		match: function()
		{
			return true;
		}
	}
];

function getHostname(url)
{
	try
	{
		return new URL(url).hostname;
	}
	catch (err)
	{
		return "";
	}
}

/**
 * @description Runs IN the page (injected via scripting.executeScript, so it
 * must stay self-contained): reports whether the page embeds a New Quizzes
 * style tool frame. Canvas launches LTI tools into its tool_content iframe,
 * whose src can be a same-host launch URL that only then redirects to the
 * quiz-lti host, so the container counts on its own; otherwise an iframe
 * whose src is on another instructure host (quiz-lti or a tool subdomain)
 * counts, mirroring the Canvas handler's getFrameId.
 *
 * @return {boolean} - True when a tool frame is present.
 */
export function pageHasQuizToolFrame()
{
	if (document.querySelector("iframe#tool_content, iframe[name='tool_content']")) return true;

	return Array.from(document.querySelectorAll("iframe[src]")).some(function(frame)
	{
		try
		{
			var host = new URL(frame.getAttribute("src"), location.href).hostname;

			return host != location.hostname && (host.includes("quiz-lti") || host.endsWith(".instructure.com"));
		}
		catch (err)
		{
			return false;
		}
	});
}
