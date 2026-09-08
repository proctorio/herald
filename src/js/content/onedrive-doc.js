var heraldDoc = ["word-edit.officeapps.live.com", "usc-word-edit.officeapps.live.com"].includes(location.hostname) ? new Docx() : new Pdf();

function Docx()
{
	this.getCurrentIndex = function()
	{
		if (hasSelection()) return -1;

		return 0;
	};

	this.getTexts = function(index)
	{
		if (index == -1) return getSelectedTexts();
		else if (index == 0) return getTexts();
		else return null;
	};

	function hasSelection()
	{
		return Array.from(document.querySelectorAll("p.Paragraph span.Selected"))
			.some(function(span)
			{
				return getInnerText(span).trim();
			});
	}

	function getSelectedTexts()
	{
		// Hide-and-restore records whether a style attribute existed at all,
		// so the page DOM is left byte-identical afterwards.
		var hidden = Array.from(document.querySelectorAll("p.Paragraph span:not(.Selected)"))
			.map(function(node)
			{
				var entry = {node: node,
																	hadStyleAttr: node.hasAttribute("style"),
																	priorDisplay: node.style.display};
				node.style.display = "none";

				return entry;
			});
		try
		{
			return getTexts();
		}
		finally
		{
			for (var entry of hidden)
			{
				if (entry.hadStyleAttr) entry.node.style.display = entry.priorDisplay;
				else entry.node.removeAttribute("style");
			}
		}
	}

	function getTexts()
	{
		return Array.from(document.querySelectorAll("p.Paragraph"))
			.map(getInnerText)
			.filter(isNotEmpty);
	}
}

function Pdf()
{
	this.getCurrentIndex = function()
	{
		const halfHeight = document.documentElement.clientHeight / 2;
		const page = Array.from(document.querySelectorAll(".OneUp-pdf--loaded .page[data-page-number]"))
			.reverse()
			.find(page => page.getBoundingClientRect().top < halfHeight);

		return page ? Number(page.dataset.pageNumber) : 0;
	};

	this.getTexts = function(index, quietly)
	{
		const page = document.querySelector(".OneUp-pdf--loaded .page[data-page-number='" + index + "']");
		if (page)
		{
			if (!quietly) page.scrollIntoView();
			const lines = Array.from(page.querySelectorAll(".textLayer >span"))
				.map(getInnerText)
				.filter(isNotEmpty);

			return fixParagraphs(lines);
		}
		else
		{
			return null;
		}
	};
}
