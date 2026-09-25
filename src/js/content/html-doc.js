var heraldDoc = new function()
{
	var self = this;

	this.ignoreTags = "select, textarea, button, label, audio, video, dialog, embed, menu, nav, noframes, noscript, object, script, style, svg, aside, footer, #footer, .no-herald, [aria-hidden=true]";

	this.getCurrentIndex = function()
	{
		return 0;
	};

	this.getTexts = async function(index)
	{
		if (index == 0)
		{
			const math = await getMath();
			try
			{
				if (math) math.show();

				return parse();
			}
			finally
			{
				if (math) math.hide();
			}
		}
		else return null;
	};

	this.getSelectedText = async function()
	{
		const math = await getMath();
		try
		{
			if (math) math.show();

			return window.getSelection().toString().trim();
		}
		finally
		{
			if (math) math.hide();
		}
	};

	// jQuery's :visible, byte for byte: the element consumes layout boxes.
	// Extraction decisions must not drift from the years of upstream behavior
	// built on this exact test.
	function isVisible(elem)
	{
		return Boolean(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
	}

	// The multi-block flag findTextBlocks hands to getTexts; jQuery's element
	// data store used to carry it. A WeakSet never touches the page DOM.
	var multiBlocks = new WeakSet();

	function parse()
	{
		// find blocks containing text
		var start = new Date();
		var textBlocks = findTextBlocks(50);
		var countChars = textBlocks.reduce(function(sum, elem) { return sum + getInnerText(elem).length; }, 0);
		console.log("Found", textBlocks.length, "blocks", countChars, "chars in", new Date() - start, "ms");

		// Quiz pages (visible radio or checkbox choice groups) are read in full
		// at the low threshold, untrimmed. Short prompts like "2 + 2 =" fall
		// under the article threshold, and the outlier trim below exists to
		// shed page chrome around a long article: on a Canvas classic quiz the
		// instructions paragraph was the outlier and every question after it
		// was cut (live Canvas pass, 2026-09-25).
		var isQuiz = hasChoiceGroups();
		if (countChars < 1000 || isQuiz)
		{
			textBlocks = findTextBlocks(3);
			var texts = textBlocks.map(getInnerText);
			console.log("Using lower threshold, found", textBlocks.length, "blocks", texts.join("").length, "chars");

			// trim the head and the tail (articles only, see above)
			var head, tail;
			if (!isQuiz)
			{
				for (var i = 3; i < texts.length && !head; i++)
				{
					var dist = getGaussian(texts, 0, i);
					if (texts[i].length > dist.mean + 2 * dist.stdev) head = i;
				}
				for (var i = texts.length - 4; i >= 0 && !tail; i--)
				{
					var dist = getGaussian(texts, i + 1, texts.length);
					if (texts[i].length > dist.mean + 2 * dist.stdev) tail = i + 1;
				}
			}
			if (head || tail)
			{
				textBlocks = textBlocks.slice(head || 0, tail);
				console.log("Trimmed", head, tail);
			}
		}

		// collect the elements to be read. No marker class is added: extraction
		// must leave the page DOM exactly as it found it (docs/herald/04).
		var toRead = [];
		for (var i = 0; i < textBlocks.length; i++)
		{
			toRead.push.apply(toRead, findHeadingsFor(textBlocks[i], textBlocks[i - 1]));
			toRead.push(textBlocks[i]);
		}

		// extract texts
		return toRead.flatMap(getTexts).filter(isNotEmpty);
	}

	function findTextBlocks(threshold)
	{
		var skipTags = "h1, h2, h3, h4, h5, h6, p, a[href], " + self.ignoreTags;
		var isTextNode = function(node)
		{
			return node.nodeType == 3 && node.nodeValue.trim().length >= 3;
		};
		var isParagraph = function(node)
		{
			return node.nodeType == 1 && node.matches("p") && isVisible(node) && getInnerText(node).length >= threshold;
		};
		var hasTextNodes = function(elem)
		{
			return someChildNodes(elem, isTextNode) && getInnerText(elem).length >= threshold;
		};
		var hasParagraphs = function(elem)
		{
			return someChildNodes(elem, isParagraph);
		};
		var unskippedChildren = function(elem)
		{
			return Array.from(elem.children).filter(function(child) { return !child.matches(skipTags); });
		};
		var containsTextBlocks = function(elem)
		{
			var childElems = unskippedChildren(elem);

			return childElems.some(hasTextNodes) || childElems.some(hasParagraphs) || childElems.some(containsTextBlocks);
		};
		var addBlock = function(elem, multi)
		{
			if (multi) multiBlocks.add(elem);
			textBlocks.push(elem);
		};
		var walk = function(elem)
		{
			if (elem.matches("frame, iframe")) try { walk(elem.contentDocument.body); }
			catch (err) {}
			else if (elem.matches("dl")) addBlock(elem);
			else if (elem.matches("ol, ul"))
			{
				var items = Array.from(elem.children);
				if (items.some(hasTextNodes)) addBlock(elem);
				else if (items.some(hasParagraphs)) addBlock(elem, true);
				else if (items.some(containsTextBlocks)) addBlock(elem, true);
			}
			else if (elem.matches("tbody"))
			{
				var rows = Array.from(elem.children);
				if (rows.length > 3 || (rows[0] && rows[0].children.length > 3))
				{
					if (rows.some(containsTextBlocks)) addBlock(elem, true);
				}
				else rows.forEach(walk);
			}

			// A radio or checkbox choice group is one readable block. Its choice
			// text lives in labels, which the scan skips, so where the prompt is
			// nested apart from the fieldset (Canvas classic quizzes) the choices
			// were never read at all.
			else if (isChoiceFieldset(elem)) addBlock(elem);
			else
			{
				if (hasTextNodes(elem)) addBlock(elem);
				else if (hasParagraphs(elem)) addBlock(elem, true);
				else
				{
					var children = unskippedChildren(elem);
					if (elem.shadowRoot) children = children.concat(Array.from(elem.shadowRoot.children).filter(function(child) { return !child.matches(skipTags); }));
					children.forEach(walk);
				}
			}
		};
		var textBlocks = [];
		walk(document.body);

		return textBlocks.filter(function(elem)
		{
			return isVisible(elem) && elem.getBoundingClientRect().left + window.scrollX >= 0;
		});
	}

	function getGaussian(texts, start, end)
	{
		if (start == undefined) start = 0;
		if (end == undefined) end = texts.length;
		var sum = 0;
		for (var i = start; i < end; i++) sum += texts[i].length;
		var mean = sum / (end - start);
		var variance = 0;
		for (var i = start; i < end; i++) variance += (texts[i].length - mean) * (texts[i].length - mean);

		return {mean: mean,
										stdev: Math.sqrt(variance)};
	}

	function getTexts(elem)
	{
		// Every temporary mutation must be reverted even when extraction throws
		// mid-block: leaked surrogate spans or still-hidden answer labels would
		// permanently alter visible exam content. Hiding saves each element's
		// prior inline display so restore is exact, the way jQuery's hide and
		// show worked.
		var hidden = Array.from(elem.querySelectorAll("*"))
			.filter(function(node) { return isVisible(node) && dontRead(node); })
			.map(hideAndRemember);
		try
		{
			findWithSelf(elem, "ol, ul").forEach(addNumbering);
			findWithSelf(elem, "fieldset").forEach(addChoiceNumbering);
			Array.from(elem.querySelectorAll("img[alt]")).filter(isVisible).forEach(addAltText);

			return multiBlocks.has(elem)
				? Array.from(elem.children).filter(isVisible).map(getText)
				: getText(elem).split(paragraphSplitter);
		}
		finally
		{
			for (const surrogate of elem.querySelectorAll(".herald-numbering, .herald-alt")) surrogate.remove();
			for (const entry of hidden) restoreDisplay(entry);
		}
	}

	// Descendants matching the selector, preceded by the element itself when
	// it matches (jQuery's find plus addBack, in document order).
	function findWithSelf(elem, selector)
	{
		var result = elem.matches(selector) ? [elem] : [];

		return result.concat(Array.from(elem.querySelectorAll(selector)));
	}

	// innerText never contains image alt text. Mirroring the math surrogate
	// pattern, a temporary span carries the alt text at the image's position
	// while the block is read, then is removed in the same cleanup pass.
	function addAltText(img)
	{
		var alt = (img.getAttribute("alt") || "").trim();
		if (alt)
		{
			var span = document.createElement("span");
			span.className = "herald-alt";
			span.textContent = " " + alt + " ";
			img.after(span);
		}
	}

	function makeNumberingSpan(number)
	{
		var span = document.createElement("span");
		span.className = "herald-numbering";
		span.textContent = number + ". ";

		return span;
	}

	function addNumbering(elem)
	{
		var children = Array.from(elem.children);
		var text = children.length ? getInnerText(children[0]) : null;
		if (text && !text.match(/^\(?(\d|[A-Za-z][).])/))
		{
			children.forEach(function(child, index)
			{
				child.prepend(makeNumberingSpan(index + 1));
			});
		}
	}

	function addChoiceNumbering(elem)
	{
		if (!isChoiceFieldset(elem)) return;
		Array.from(elem.querySelectorAll("label"))
			.filter(function(label)
			{
				// nested choice fieldsets: a label already numbered by an outer
				// fieldset pass is skipped, so numbering never double-applies
				return isChoiceLabel(label) && isVisible(label) &&
					!label.querySelector(":scope > .herald-numbering");
			})
			.forEach(function(label, index)
			{
				label.prepend(makeNumberingSpan(index + 1));
			});
	}

	function dontRead(elem)
	{
		var style = getComputedStyle(elem);

		// Labels that carry radio or checkbox choice text are read; the bare
		// "label" entry in ignoreTags only hides plain form labels.
		var ignoreTags = isChoiceLabel(elem) ? getIgnoreTagsWithoutLabel() : self.ignoreTags;

		return elem.matches(ignoreTags) || isHiddenChoiceLegend(elem) || elem.matches("sup") || style.float == "right" || style.position == "fixed";
	}

	var ignoreTagsWithoutLabel = {source: null,
																															value: null};

	function getIgnoreTagsWithoutLabel()
	{
		if (ignoreTagsWithoutLabel.source != self.ignoreTags)
		{
			ignoreTagsWithoutLabel.source = self.ignoreTags;
			ignoreTagsWithoutLabel.value = self.ignoreTags.split(",")
				.map(function(item)
				{
					return item.trim();
				})
				.filter(function(item)
				{
					return item != "label";
				})
				.join(", ");
		}

		return ignoreTagsWithoutLabel.value;
	}

	function isChoiceLabel(elem)
	{
		if (!elem.matches("label")) return false;
		if (elem.querySelector("input[type=radio], input[type=checkbox]")) return true;
		var forId = elem.getAttribute("for");
		if (!forId) return false;
		var bound = elem.ownerDocument && elem.ownerDocument.getElementById(forId);

		return Boolean(bound) && bound.matches("input[type=radio], input[type=checkbox]");
	}

	function hasChoiceGroups()
	{
		return Array.from(document.querySelectorAll("fieldset")).some(function(fieldset)
		{
			return isChoiceFieldset(fieldset) && isVisible(fieldset);
		});
	}

	function isChoiceFieldset(elem)
	{
		return Boolean(elem) && elem.matches("fieldset") && Boolean(elem.querySelector("input[type=radio], input[type=checkbox]"));
	}

	// Screen-reader-only legends inside a choice fieldset (the clip or offscreen
	// absolute positioning patterns) duplicate what the numbered choices already
	// convey, so they are excluded from the read text. That includes visually
	// hidden content INSIDE such a legend: Canvas New Quizzes wrap the legend
	// text in an InstUI ScreenReaderContent span, which re-announced the
	// question number the question heading had just read.
	function isHiddenChoiceLegend(elem)
	{
		var legend = elem.closest("legend");
		if (!legend) return false;
		if (!isChoiceFieldset(legend.closest("fieldset"))) return false;

		return isScreenReaderOnly(elem);
	}

	function isScreenReaderOnly(elem)
	{
		var style = getComputedStyle(elem);
		if (style.position != "absolute" && style.position != "fixed") return false;
		if (style.clip && style.clip != "auto") return true;
		if (style.clipPath && style.clipPath != "none") return true;

		return elem.offsetWidth <= 1 && elem.offsetHeight <= 1;
	}

	function getText(elem)
	{
		return addMissingPunctuation(elem.innerText).trim();
	}

	function addMissingPunctuation(text)
	{
		return text.replaceAll(/(\w)(\s*?\r?\n)/g, "$1.$2");
	}

	function findHeadingsFor(block, prevBlock)
	{
		var result = [];
		var firstInnerElem = Array.from(block.querySelectorAll("h1, h2, h3, h4, h5, h6, p")).filter(isVisible)[0];
		var currentLevel = getHeadingLevel(firstInnerElem);
		var node = previousNode(block, true);
		while (node && node != prevBlock)
		{
			var ignore = node.nodeType == 1 && node.matches(self.ignoreTags);
			if (!ignore && node.nodeType == 1 && isVisible(node))
			{
				var level = getHeadingLevel(node);
				if (level < currentLevel)
				{
					result.push(node);
					currentLevel = level;
				}
			}
			node = previousNode(node, ignore);
		}

		return result.reverse();
	}

	function getHeadingLevel(elem)
	{
		var matches = elem && (/^h(\d)$/i).exec(elem.tagName);

		return matches ? Number(matches[1]) : 100;
	}

	function previousNode(node, skipChildren)
	{
		if (node.nodeType == 1 && node.matches("body")) return null;
		if (node.nodeType == 1 && !skipChildren && node.lastChild) return node.lastChild;
		if (node.previousSibling) return node.previousSibling;
		if (node.parentNode) return previousNode(node.parentNode, true);

		return null;
	}

	function someChildNodes(elem, test)
	{
		var child = elem.firstChild;
		while (child)
		{
			if (test(child)) return true;
			child = child.nextSibling;
		}

		return false;
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
