// includes html-doc.js

// Canvas quizzes render answers as labeled radio and checkbox groups, which
// the generic extractor already reads in document order with option
// numbering. This handler only adds the Canvas-specific ignore rules:
// screen-reader helper text that would otherwise leak into the read text.
heraldDoc.ignoreTags += ", .screenreader-only, .screenreader-only-context, .ui-helper-hidden-accessible";

// Canvas chrome that sits beside the questions and is never exam content:
// the quiz autosave status ("No new data to save. Last checked at ...") and
// the Student View bar teachers see while previewing as a student.
heraldDoc.ignoreTags += ", #last_saved_indicator, #masquerade_bar";
