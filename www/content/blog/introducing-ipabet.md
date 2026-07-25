---
title: "Introducing IPAbet"
description: "Designing a better way to type the International Phonetic Alphabet"
date: "2026-07-24"
---

The International Phonetic Alphabet (IPA) is the universal standard for documenting human speech, capable of transcribing the sounds of any language on Earth. But if you want to type it today, your options are limited. You can use a website with a virtual keyboard to write out letters one click at a time. Or, if you’re looking for a pure typing solution, your best bet might be to install Keyman: a complex tool which sits between your OS and your keyboard, designed less for IPA and more for intricate scripts like Khmer and Tibetan.

As a programmer, this situation has always struck me as absurd. IPA is around 140 years old. It is used professionally by linguists, language instructors, singers, actors, speech pathologists, news broadcasters — basically anyone who cares about describing and pronouncing speech with scientific precision. Nevertheless, there’s no easy way to type it, even though there are complex input method editors (IMEs), like those for Japanese and Chinese, which allow users to type thousands of individual logographs.

Armed with Claude, who can reasonably vibe-code a macOS IME, and is highly knowledgeable on matters of phonetics and orthography, I set out to create a better way to type IPA. The result is *IPAbet*, a fast and intuitive typing system designed for phonetic transcription, with native macOS and browser support for its initial release.

Here is what it looks like:

<TypingDemo words="ship vision thing"/>

## Designing the keyboard

The challenge of creating a new IPA keyboard has less to do with technology and more to do with design. The problem is one of constrained space: while IPA’s range of symbols is smaller than those of other world writing systems — 107 vowels and consonants, plus about 50 diacritics and other markers — this is still more than can fit on the standard ANSI keyboard, which has only 47 keys for letters, numbers and punctuation. Other IMEs allow you to type out *words* with Latin letters and pick out what you meant from a list of candidates, but IPA’s letters represent *sounds*, not words, and choosing symbols from a menu was exactly the experience I wanted to avoid.

English solved this problem for some sounds by representing them with two-letter combinations like ⟨sh⟩, ⟨th⟩, and ⟨ng⟩. The ⟨h⟩ and ⟨g⟩ letters in these *digraphs* don’t represent sounds on their own. Rather, they act as signals that the previous letter has moved somewhere else in the mouth. These conventions were created organically by scribes and printers hundreds of years ago and have survived into modern English spelling.

What if we could use two-letter combinations to write out the extra letters of IPA? This would solve the space problem. Even with only the letter keys, that’s 676 (26²) open slots. And if you could somehow type ⟨th⟩ and produce the equivalent /θ/ sound, it would be immediately intuitive. But how do we transform two-letter combinations without interrupting normal typing? If typing ⟨th⟩ *always* produced /θ/, you could no longer use the keyboard normally. And even if the keyboard were just for typing IPA and not English, two-letter combinations might collide due to clustered consonants. For instance, the word ⟨mishap⟩ contains ⟨sh⟩, but not /ʃ/.

Fortunately, we can take advantage of two facts: first, in English, capital letters only appear at the start of words in typical typing, and second, IPA has no capitalized letters. Therefore, a capital letter in the middle of a word can signal a transformation: <Combo keys="s ⇧H" out="ʃ"/>, while lowercase is left alone, so the ⟨sh⟩ inside ⟨mishap⟩ survives untransformed: <Combo keys="m i ⇧H s h a ⇧E p" out="mɪshæp"/>. This *shifted modifier* transformation system is both ergonomic and unambiguous. Except for certain edge cases for weird spellings like ⟨GitHub⟩ rendering as ⟨Giθub⟩, you can write and use the keyboard normally, while being able to type out IPA at the speed of touch typing.

## Assigning the letters

Once we figured out the mechanism, the fun and creative part was figuring out which two-letter mappings corresponded to which sounds. The base Latin alphabet maps exactly to the corresponding IPA letter, and these letters can be thought of as starting points, or bases, which are transformed by shifted, uppercase modifiers.

Initially, the modifiers were selected based on familiarity with various latinizations. We seeded the layout with spellings people already knew — English’s own ⟨sh⟩ for /ʃ/ and ⟨th⟩ for /θ/, the Slavic ⟨zh⟩ that spells /ʒ/. To handle series like the rhotics and the palatal consonants, we treated shifted modifiers as articulatory transforms: ⇧R retroflexes, ⇧J palatalizes, and entire columns in the IPA chart fall out of one rule — <Combo keys="t ⇧R" out="ʈ"/> <Combo keys="n ⇧J" out="ɲ"/> <Combo keys="l ⇧J" out="ʎ"/>. Each shifted letter became a modifier which could be tied to a specific linguistic transformation.

Click a shifted letter below to see the arrows it draws across the consonant chart:

<ConsonantChart/>

The vowel space works the same way — every vowel is a base letter and at most one modifier: <Combo keys="i ⇧H" out="ɪ"/> <Combo keys="e ⇧W" out="ø"/> <Combo keys="e ⇧5" out="ɜ"/>.

<VowelChart/>

Some symbols in IPA had no good Latin bases or modifiers, like those for /ʔ/, /ʕ/ and /ħ/. For these, we used ⟨2⟩, ⟨3⟩, and ⟨7⟩ as bases, borrowing from the Arabizi convention which Arabic speakers have typed on their phones for twenty years — an Arabizi ⟨7abibi⟩ types straight into IPA: <Combo keys="7 ⇧H a b i b i" out="ħabibi"/>. Other numbers were added out of necessity: ⟨4⟩ for the quick tap /ɾ/ drew from X-SAMPA because we ran out of letters to combine with R, and ⟨5⟩ became the home key of the schwa /ə/ because as the “true center vowel” it doesn’t make sense to write it with any other letter.

Finally, diacritics live on the Option layer and work like the accent dead keys already built into your Mac — the same way ⌥e then e gives é: nasalize with <Combo keys="⌥n a" out="ã"/>, lengthen with <Combo keys="a ⌥;" out="aː"/>, mark a rising tone with <Combo keys="⌥v e" out="ě"/>, tie an affricate with <Combo keys="t ⌥j s" out="t͡s"/>, place stress with <Combo keys="⌥'" out="ˈ"/>, even stack Chao tone letters into contours: <Combo keys="⌥1 ⌥5" out="˩˥"/>. Put together, even narrow transcription flows off the fingers — “cheesecake”, with its affricate, stresses, and length, can be written in one unbroken run: <Combo keys="⌥' t ⌥j s ⇧H i ⌥; z ⌥⇧' k e i ⇧H k" out="ˈt͡ʃiːzˌkeɪk"/>. The keyboard is comprehensive: every mark on the IPA chart and even many from extIPA are covered.

## Try it
IPAbet is free, open source and fully offline. If you’re a Mac person, [download the input method](/download) and type IPA at full speed in every application. Otherwise, you can use the [web scratchpad](/type) or wait for the keyboard to be ported to your platform.

Additionally, if you’re new to IPA, there is a typing tutorial to [learn it properly in an afternoon](/learn). And if you already know IPA, the [official chart](/chart) has been annotated with every keystroke, as a printable page.
