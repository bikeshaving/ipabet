// @b9g/ipabet — the IPAbet engine in TypeScript. The composition is the
// transforms in spec/ipabet.xml, run by the LDML executor (ldml.ts); this
// module is the IME contract every host binds to.

export {
  type Keystroke, type Edit, type Pending, type Step,
  SHIFTED_DIGITS, SHIFTED_PUNCT, nativeChar, applyEdit,
  setCapitalDigraphs, setQuoteLocale, previewString,
  handleKey, handleBackspace, handleUnconvert, typeKeys,
} from "./ldml.ts";
export {QUOTE_LOCALES} from "./quotes.ts";
