var heraldDoc = new function()
{
	var viewport = document.querySelector(".drive-viewer-paginated-scrollable");
	var pages = Array.from(document.querySelectorAll(".drive-viewer-paginated-page"));

	this.getCurrentIndex = function()
	{
		for (var i = 0; i < pages.length; i++) if (pages[i].offsetTop > viewport.scrollTop + viewport.clientHeight / 2) break;

		return i - 1;
	};

	this.getTexts = function(index, quietly)
	{
		var page = pages[index];
		if (page)
		{
			var oldScrollTop = viewport.scrollTop;
			viewport.scrollTop = page.offsetTop;

			return tryGetTexts(getTexts.bind(page), 3000)
				.then(function(result)
				{
					if (quietly) viewport.scrollTop = oldScrollTop;

					return result;
				});
		}
		else return null;
	};

	function getTexts()
	{
		var texts = Array.from(this.querySelectorAll("p"))
			.map(getInnerText)
			.filter(isNotEmpty);

		return fixParagraphs(texts);
	}
};
