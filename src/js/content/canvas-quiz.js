// includes html-doc.js

// Canvas quizzes render answers as labeled radio and checkbox groups, which
// the generic extractor already reads in document order with option
// numbering. This handler only adds the Canvas-specific ignore rules:
// screen-reader helper text that would otherwise leak into the read text.
heraldDoc.ignoreTags += ", .screenreader-only, .screenreader-only-context, .ui-helper-hidden-accessible";
