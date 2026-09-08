var heraldDoc = new function()
{
	this.getCurrentIndex = function()
	{
		return 0;
	};

	this.getTexts = function(index)
	{
		if (index == 0) return parse();
		else return null;
	};

	function parse()
	{
		var texts = Array.from(document.querySelectorAll("#chapters .userstuff p")).map(getInnerText);
		var titles = Array.from(document.querySelectorAll("#chapters .title")).map(getInnerText);

		return titles.concat(texts)
			.filter(isNotEmpty);
	}
};
