var heraldDoc = new function()
{
	var viewport, pages;

	this.getCurrentIndex = function()
	{
		var doc = Array.from(document.querySelectorAll("[role=document]")).filter(isElementVisible)[0];
		viewport = doc && doc.parentElement;
		pages = doc ? Array.from(doc.children) : [];
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
