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
		var elems = Array.from(document.querySelectorAll(".secContentPiece:not(.secContentPiece .secContentPiece)")).filter(hasNoHiddenParent);

		// Hide-and-restore keeps each legend's prior inline display exact.
		var hidden = elems.flatMap(function(elem) { return Array.from(elem.querySelectorAll(".legend")); })
			.map(hideAndRemember);
		var texts = elems.map(getInnerText);
		for (var entry of hidden) restoreDisplay(entry);

		return texts;
	}

	function hasNoHiddenParent(elem)
	{
		var node = elem.parentNode;
		while (node && node != document.body)
		{
			if (node.nodeType == 1 && getComputedStyle(node).visibility == "hidden") return false;
			node = node.parentNode;
		}

		return true;
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
