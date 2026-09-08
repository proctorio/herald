var heraldDoc = new function()
{
	var scroller = document.querySelector(".punch-filmstrip-scroll");
	var autoFlip;
	getSettings(["googleSlidesAutoFlip"])
		.then(function(items)
		{
			autoFlip = items.googleSlidesAutoFlip;
		})
		.then(createOptionsPanel);

	this.getCurrentIndex = function()
	{
		var currentSlide = getCurrentSlide();

		return currentSlide ? getSlides().indexOf(currentSlide) : 0;
	};

	this.getTexts = function(index, quietly)
	{
		var slide = getSlides()[index];
		if (slide && (autoFlip || slide == getCurrentSlide()))
		{
			if (!quietly)
			{
				simulateClick(slide);
				scroller.scrollTop = slide.getBoundingClientRect().top - scroller.firstChild.getBoundingClientRect().top;
			}
			const texts = getTexts(slide);
			texts.unshift("Slide " + (index + 1) + ".");

			return texts;
		}
		else return null;
	};

	function getTexts(slide)
	{
		return Array.from(slide.querySelectorAll("[id*=paragraph]"))
			.map(function(para)
			{
				return Array.from(para.querySelectorAll("text"))
					.map(function(elem) { return elem.textContent; })
					.join(" ");
			});
	}

	function getSlides()
	{
		return Array.from(document.querySelectorAll(".punch-filmstrip-thumbnail"));
	}

	function getCurrentSlide()
	{
		var border = document.querySelector(".punch-filmstrip-thumbnail-border[style^=stroke]");

		return border ? border.parentElement : undefined;
	}

	function createOptionsPanel()
	{
		if (document.querySelector(".ra-options")) return;
		var menubar = document.getElementById("docs-menubar");
		if (!menubar) return;
		var label = document.createElement("label");
		label.className = "ra-options";
		label.style.marginLeft = "2em";
		label.style.color = "purple";
		label.appendChild(document.createTextNode(" Go to next slide automatically"));
		var checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = Boolean(autoFlip);
		checkbox.addEventListener("change", function()
		{
			autoFlip = this.checked;
			updateSettings({googleSlidesAutoFlip: autoFlip});
		});
		label.prepend(checkbox);
		menubar.appendChild(label);
	}
};
