function findNavButton(arrowSelector, labelSelector)
{
	var arrow = document.querySelector(arrowSelector);
	var button = arrow && arrow.closest("button");

	return button || document.querySelector(labelSelector);
}

var prevBtn = findNavButton("svg.leftArrow", "button[aria-label^=prev]");
var nextBtn = findNavButton("svg.rightArrow", "button[aria-label^=next]");

var rad = heraldDoc;
var currentIndex = 0;

heraldDoc = {
	getCurrentIndex()
	{
		return currentIndex = 0;
	},
	async getTexts(index)
	{
		while (currentIndex < index)
		{
			if (!nextBtn) return null;
			const promise = waitFrameChange();
			nextBtn.click();
			await promise;
			currentIndex++;
		}
		while (currentIndex > index)
		{
			if (!prevBtn) return null;
			const promise = waitFrameChange();
			prevBtn.click();
			await promise;
			currentIndex--;
		}

		return rad.getTexts(rad.getCurrentIndex());
	}
};

function waitFrameChange()
{
	return new Promise(fulfill =>
	{
		const oldFrame = document.getElementById("contentIframe");
		const observer = new MutationObserver(() =>
		{
			const newFrame = document.getElementById("contentIframe");
			if (newFrame && newFrame != oldFrame)
			{
				observer.disconnect();
				newFrame.addEventListener("load", fulfill, {once: true});
			}
		});
		observer.observe(document.getElementById("viewer"), {childList: true});
	});
}
