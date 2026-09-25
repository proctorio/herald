import { brapi } from "./brapi.js";
import * as rxjs from "./vendor/rxjs.js";
import { defaults, domReady, setI18nText, getHotkeySettingsUrl, updateSettings, updateSetting, clearSettings, observeSetting, settingsChange$, immediate, groupVoicesByLang, getVoiceLanguages, getFirstLanguage, isOfflineVoice, findVoiceByName, parseLang, formatError, bgPageInvoke, effectiveShowHighlighting } from "./defaults.js";
import { registerMessageListener } from "./messaging.js";
import { voices$ } from "./tts-engines.js";

(function()
{
	const domReadyPromise = domReady();
	const playerCheckIn$ = new rxjs.Subject();

	function byId(id)
	{
		return document.getElementById(id);
	}

	// Shows or hides an element. Elements hidden by a stylesheet rule need an
	// explicit display value to show (clearing the inline style would fall
	// back to the hiding rule), so callers pass one where that applies.
	function setShown(elem, shown, displayWhenShown)
	{
		elem.style.display = shown ? (displayWhenShown || "") : "none";
	}

	function isShown(elem)
	{
		return getComputedStyle(elem).display != "none";
	}

	domReadyPromise.then(() => byId("about-version").textContent = brapi.runtime.getManifest().version);

	registerMessageListener("options", {
		playerCheckIn()
		{
			playerCheckIn$.next();
		}
	});

	// i18n
	domReadyPromise
		.then(setI18nText);

	// hotkey
	domReadyPromise
		.then(() =>
		{
			const link = byId("hotkeys-link");
			link.addEventListener("click", function()
			{
				brapi.tabs.create({url: getHotkeySettingsUrl()});
			});
			link.addEventListener("keydown", function(event)
			{
				// Links activate on Enter only; the click path is reused.
				if (event.key == "Enter") this.click();
			});
		});

	// voice
	domReadyPromise
		.then(() =>
		{
			byId("voices").addEventListener("change", function()
			{
				var voiceName = this.value;
				if (voiceName == "@languages") brapi.tabs.create({url: "languages.html"});
				else updateSettings({voiceName});
			});
			byId("languages-edit-button").addEventListener("click", function()
			{
				brapi.tabs.create({url: "languages.html"});
			});
		});

	const voicesPopulatedObservable = rxjs.combineLatest([
		voices$,
		observeSetting("languages"),
		brapi.i18n.getAcceptLanguages().catch(err =>
		{
			console.error(err);

			return [];
		}),
		domReadyPromise
	]).pipe(
		rxjs.tap(([voices, languages, acceptLangs]) => populateVoices(voices, {languages}, acceptLangs)),
		rxjs.share()
	);

	rxjs.combineLatest([observeSetting("voiceName"), voicesPopulatedObservable])
		.subscribe(([voiceName]) =>
		{
			byId("voices").value = voiceName || "";
		});

	// rate
	const rateSliderPromise = domReadyPromise
		.then(() =>
		{
			const ratePow = () => Number(byId("rate").dataset.pow);
			const slider = createSlider(byId("rate"), {
				onChange(value)
				{
					const rate = Math.pow(ratePow(), value);
					updateSetting("rate" + byId("voices").value, Number(rate.toFixed(3)));
				},
				formatValue(value)
				{
					return Math.pow(ratePow(), value).toFixed(2) + "x";
				}
			});
			byId("rate-edit-button").addEventListener("click", function()
			{
				// Swaps between the slider and the free-form input; both are
				// stylesheet-driven, so showing needs an explicit display.
				setShown(byId("rate"), !isShown(byId("rate")));
				setShown(byId("rate-input-div"), !isShown(byId("rate-input-div")), "block");
			});
			byId("rate-input").addEventListener("change", function()
			{
				var val = this.value.trim();
				if (isNaN(val)) this.value = 1;
				else if (val < 0.1) this.value = 0.1;
				else if (val > 10) this.value = 10;
				else setShown(byId("rate-edit-button"), false);
				updateSetting("rate" + byId("voices").value, Number(this.value));
			});

			return slider;
		});

	const rateObservable = observeSetting("voiceName")
		.pipe(
			rxjs.switchMap(voiceName => observeSetting("rate" + (voiceName || ""))),
			rxjs.share()
		);

	rxjs.combineLatest([rateObservable, rateSliderPromise])
		.subscribe(([rate, slider]) =>
		{
			slider.setValue(Math.log(rate || defaults.rate) / Math.log(Number(byId("rate").dataset.pow)));
			byId("rate-input").value = rate || defaults.rate;
		});

	rxjs.combineLatest([observeSetting("voiceName"), rateObservable, domReadyPromise])
		.subscribe(([voiceName, rate]) =>
		{
			setShown(byId("rate-warning"), rate > 2, "block");
		});

	// pitch
	const pitchSliderPromise = domReadyPromise
		.then(() =>
			createSlider(byId("pitch"), {
				onChange(value)
				{
					updateSettings({pitch: value});
				}
			}));

	rxjs.combineLatest([observeSetting("pitch"), pitchSliderPromise])
		.subscribe(([pitch, slider]) => slider.setValue(pitch || defaults.pitch));

	// volume
	const volumeSliderPromise = domReadyPromise
		.then(() =>
			createSlider(byId("volume"), {
				onChange(value)
				{
					updateSettings({volume: value});
				}
			}));

	rxjs.combineLatest([observeSetting("volume"), volumeSliderPromise])
		.subscribe(([volume, slider]) => slider.setValue(volume || defaults.volume));

	// showHighlighting
	domReadyPromise
		.then(() =>
		{
			byId("show-highlighting").addEventListener("change", function()
			{
				updateSettings({showHighlighting: this.value});
			});
		});

	// The displayed value collapses the window choice to the popup while
	// exam-safe mode is on (milestone M5); the stored preference is kept.
	rxjs.combineLatest([observeSetting("showHighlighting"), observeSetting("examSafeMode"), domReadyPromise])
		.subscribe(([showHighlighting, examSafeMode]) => byId("show-highlighting").value = String(effectiveShowHighlighting(showHighlighting || defaults.showHighlighting, examSafeMode)));

	// Link announcements are opt-in: inside running prose they arrive every
	// few words (owner decision 2026-09-25). Buttons and icon-only controls
	// are always announced, so they have no option.
	domReadyPromise
		.then(() =>
		{
			byId("announce-links").addEventListener("change", function()
			{
				updateSettings({announceLinks: this.checked});
			});
		});

	rxjs.combineLatest([observeSetting("announceLinks"), domReadyPromise])
		.subscribe(([announceLinks]) =>
		{
			byId("announce-links").checked = Boolean(announceLinks);
		});

	// exam-safe mode (milestone M5): reads the active tab only, never opens
	// windows, and keeps overlay announcements on.
	domReadyPromise
		.then(() =>
		{
			byId("exam-safe-mode").addEventListener("change", function()
			{
				updateSettings({examSafeMode: this.checked});
			});
		});

	rxjs.combineLatest([observeSetting("examSafeMode"), domReadyPromise])
		.subscribe(([examSafeMode]) =>
		{
			byId("exam-safe-mode").checked = Boolean(examSafeMode);

			// The window highlighting surface opens a popout window, which
			// exam-safe mode forbids; hide the choice while the mode is on.
			const windowOption = document.querySelector("#show-highlighting option[value='2']");
			windowOption.disabled = Boolean(examSafeMode);
			setShown(windowOption, !examSafeMode);
		});

	// voiceTest
	const demoSpeech = {
		get(lang)
		{
			return Promise.resolve({text: "This is a sample of the selected voice reading aloud."});
		}
	};
	const voiceTestSubject = new rxjs.Subject();
	rxjs.defer(() => domReadyPromise).pipe(rxjs.exhaustMap(() =>
		voiceTestSubject.pipe(
			rxjs.switchScan(
				({state}) =>
					rxjs.iif(
						() => state == "STOPPED",

						// play
						rxjs.defer(() =>
							voices$.pipe(rxjs.take(1))).pipe(
							rxjs.exhaustMap(voices =>
							{
								const voiceName = byId("voices").value;
								const voice = voiceName && findVoiceByName(voices, voiceName);
								const {lang} = parseLang(voice && getFirstLanguage(voice) || "en-US");

								return rxjs.defer(() => demoSpeech.get(lang)).pipe(rxjs.exhaustMap(({text}) => bgPageInvoke("playText", [text, {lang}])));
							}),
							rxjs.exhaustMap(() =>
								rxjs.timer(100, 500).pipe(
									rxjs.exhaustMap(() => bgPageInvoke("getPlaybackState")),
									rxjs.takeWhile(({state}) => state != "STOPPED", true)
								))
						),

						// stop
						rxjs.defer(() => bgPageInvoke("stop")).pipe(rxjs.map(() => ({state: "STOPPED"})))
					),
				{state: "STOPPED"}
			),
			rxjs.startWith({state: "STOPPED"})
		))).subscribe({
		next({state, playbackError})
		{
			setShown(document.querySelector("#test-voice .spinner"), state == "LOADING");
			document.querySelector("#test-voice [data-i18n]").textContent = brapi.i18n.getMessage(state == "STOPPED" ? "options_test_button" : "options_stop_button");
			if (state == "STOPPED" && playbackError) handleError(playbackError);
			else setShown(byId("status").parentElement, false);
		},
		error: handleError
	});

	// buttons
	domReadyPromise
		.then(() =>
		{
			byId("test-voice").addEventListener("click", () => voiceTestSubject.next());
			byId("reset").addEventListener("click", function()
			{
				clearSettings();
			});
		});

	// status
	domReadyPromise
		.then(() =>
		{
			setShown(byId("status").parentElement, false);
		});

	var confirmationTimer;
	settingsChange$
		.subscribe(() =>
		{
			showConfirmation();
			bgPageInvoke("stop").catch(err => "OK");
		});

	function populateVoices(allVoices, settings, acceptLangs)
	{
		const select = byId("voices");
		select.replaceChildren(new Option("Auto select", ""));

		// get voices filtered by selected languages
		var selectedLangs = immediate(() =>
		{
			if (settings.languages) return settings.languages.split(",");
			if (settings.languages == "") return null;
			const accept = new Set(acceptLangs.map(x => x.split("-", 1)[0]));
			const langs = Object.keys(groupVoicesByLang(allVoices)).filter(x => accept.has(x));

			return langs.length ? langs : null;
		});
		var voices = !selectedLangs ? allVoices : allVoices.filter(function(voice)
		{
			const voiceLanguages = getVoiceLanguages(voice);

			return !voiceLanguages ||
          voiceLanguages.map(parseLang).some(({ lang }) => selectedLangs.includes(lang));
		});

		// group by offline/standard
		var groups = Object.assign(
			{
				offline: [],
				standard: []
			},
			voices.groupBy(function(voice)
			{
				if (isOfflineVoice(voice)) return "offline";

				return "standard";
			})
		);
		for (var name in groups) groups[name].sort(voiceSorter);

		function makeGroup(label)
		{
			const group = document.createElement("optgroup");
			if (label) group.setAttribute("label", label);
			select.appendChild(group);

			return group;
		}

		// create the offline optgroup
		const offline = makeGroup(brapi.i18n.getMessage("options_voicegroup_offline"));
		for (const voice of groups.offline)
		{
			offline.appendChild(new Option(voice.voiceName, voice.voiceName));
		}

		// create the standard optgroup
		makeGroup();
		const standard = makeGroup(brapi.i18n.getMessage("options_voicegroup_standard"));
		for (const voice of groups.standard)
		{
			standard.appendChild(new Option(voice.voiceName, voice.voiceName));
		}

		// create the additional optgroup
		makeGroup();
		const additional = makeGroup(brapi.i18n.getMessage("options_voicegroup_additional"));
		additional.appendChild(new Option(brapi.i18n.getMessage("options_add_more_languages"), "@languages"));
	}

	function voiceSorter(a, b)
	{
		return a.voiceName.localeCompare(b.voiceName);
	}

	// The saved confirmation appears for a moment next to the buttons. The
	// design system defines no motion, so this is an instant show and hide
	// in both motion preferences (reduced motion gets the identical
	// treatment by construction).
	function showConfirmation()
	{
		const check = document.querySelector(".green-check");
		clearTimeout(confirmationTimer);
		setShown(check, true, "inline-block");
		confirmationTimer = setTimeout(function() { setShown(check, false); }, 1000);
	}

	function handleError(err)
	{
		const status = byId("status");
		if ((/^{/).test(err.message))
		{
			var errInfo = JSON.parse(err.message);

			// formatError produces trusted extension-authored markup (i18n
			// strings with action links), never page content.
			status.innerHTML = formatError(errInfo);
		}
		else
		{
			status.textContent = err.message;
		}
		setShown(status.parentElement, true);
	}

	function createSlider(elem, {onChange, onSlideChange, formatValue})
	{
		// A native range input provides the slider role, keyboard operation,
		// and forced-colors rendering for free. Positions are integer steps;
		// aria-valuetext carries the effective value so assistive tech never
		// hears the raw step number.
		var min = Number(elem.dataset.min) || 0;
		var max = Number(elem.dataset.max) || 1;
		var steps = Number(elem.dataset.steps) || 20;
		var format = formatValue || function(value) { return String(Math.round(value * 100) / 100); };
		const input = document.createElement("input");
		input.type = "range";
		input.min = 0;
		input.max = steps;
		input.step = 1;
		var labelId = elem.dataset.label;
		if (labelId) input.setAttribute("aria-labelledby", labelId);
		elem.classList.add("slider");
		elem.replaceChildren(input);

		input.addEventListener("input", function()
		{
			var value = toValue(Number(this.value));
			input.setAttribute("aria-valuetext", format(value));
			if (onSlideChange) onSlideChange(value);
		});
		input.addEventListener("change", function()
		{
			var value = toValue(Number(this.value));
			input.setAttribute("aria-valuetext", format(value));
			onChange(value);
		});

		return {
			setValue(value)
			{
				var position = Math.round((Math.min(value, max) - min) / (max - min) * steps);
				input.value = position;
				input.setAttribute("aria-valuetext", format(toValue(position)));
			}
		};

		function toValue(position)
		{
			return min + (position / steps) * (max - min);
		}
	}

})();
