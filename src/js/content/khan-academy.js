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
		var elems = [];
		var firstHeading = document.querySelector("h1");
		if (firstHeading) elems.push(firstHeading);
		for (var paragraph of document.querySelectorAll(".paragraph:not(.paragraph .paragraph)"))
		{
			elems.push(...paragraph.querySelectorAll(":scope > :not(ul, ol), :scope > ul > li, :scope > ol > li"));
		}

		// Hide-and-restore keeps each element's prior inline display exact.
		var hidden = elems.flatMap(function(elem) { return Array.from(elem.querySelectorAll(".katex, legend")); })
			.map(hideAndRemember);
		var texts = elems.map(function(elem)
		{
			var text = getInnerText(elem);
			if (elem.matches("li")) return (Array.prototype.indexOf.call(elem.parentElement.children, elem) + 1) + ". " + text;
			else return text;
		});
		for (var entry of hidden) restoreDisplay(entry);

		return texts;
	}

	// Hides a node remembering its exact prior state: the inline display value
	// AND whether a style attribute existed at all, so the restore leaves the
	// DOM byte-identical (a leftover empty style attribute is still a change).
	function hideAndRemember(node)
	{
		var entry = {node: node,
															hadStyleAttr: node.hasAttribute("style"),
															priorDisplay: node.style.display};
		node.style.display = "none";

		return entry;
	}

	function restoreDisplay(entry)
	{
		if (entry.hadStyleAttr) entry.node.style.display = entry.priorDisplay;
		else entry.node.removeAttribute("style");
	}

};
