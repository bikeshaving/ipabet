---
title: "Introducing IPAbet"
description: "Designing a better way to type the International Phonetic Alphabet"
date: "2026-07-21"
draft: true
---

The International Phonetic Alphabet (IPA) is the universal standard for documenting human speech, capable of transcribing the sounds of any language on Earth. But if you want to type it today, your options are limited. You can use a website with a virtual keyboard to write out letters one click at a time. Or, if you’re looking for a pure typing solution, your best bet might be to install Keyman: a complex tool which sits between your OS and your keyboard, designed less for IPA and more for intricate scripts like Khmer and Tibetan.

As a programmer, this situation has always struck me as absurd. As of this year, IPA is 140 years old. It is used professionally by linguists, language instructors, singers, actors, speech pathologists, news broadcasters — basically anyone who cares about describing and pronouncing speech with scientific precision. Nevertheless, there’s no easy way to type it, even though there are complex input method editors (IMEs) like those for Japanese and Chinese which allow users to type thousands of individual logographs.

Armed with Claude, who can reasonably vibe-code a macOS IME, and is highly knowledgeable on matters of phonetics and orthography, I set out to create a better way to type IPA. The result is *IPAbet*, a fast and intuitive typing system designed for phonetic transcription, with native macOS and browser support for its initial release.

## Designing the keyboard

The challenge of creating a new IPA keyboard has less to do with engineering and more to do with design. The problem is one of constrained space: while IPA’s range of symbols is smaller than those of other world writing systems — 107 vowels and consonants, plus about 50 diacritics and other markers — this is still more than can fit on the standard ANSI keyboard, which has only 47 keys for letters, numbers and punctuation. Other IMEs allow you to type out *words* with Latin letters and pick out what you meant from a list of candidates, but IPA’s letters represent *sounds*, not words, and choosing symbols from a menu was exactly the experience we want to avoid.

English solved this problem for some sounds by representing them with two-letter combinations like ⟨sh⟩, ⟨th⟩, and ⟨ng⟩. The ⟨h⟩ and ⟨g⟩ letters in these *digraphs* don’t represent sounds on their own. Rather, they are signals that the previous letter has moved somewhere else in the mouth. These conventions were created organically by scribes and printers hundreds of years ago and have survived into modern English spelling.

What if we could use two-letter combinations to write out the extra letters of IPA? This would solve the space problem. Even with only the letter keys, that’s 676 (26²) open slots. And if you could somehow type ⟨th⟩ and produce /θ/, it would be immediately intuitive. But how do we transform two-letter combinations without interrupting normal typing? If typing ⟨th⟩ *always* produced /θ/, you could no longer use the keyboard normally. And even if the keyboard were just for typing IPA and not English, two-letter combinations might collide with clustered consonants. For instance, the word ⟨mishap⟩ contains ⟨sh⟩, but not /ʃ/.

Fortunately, we can take advantage of two facts: first, capital letters typically only appear at the start of words in normal writing, and second, IPA has no capitalized letters. Therefore, a capital letter in the middle of a word can signal a transformation: <Combo keys="s ⇧H" out="ʃ"/>, while lowercase is left alone, so transcribing ⟨mishap⟩ as /mɪshæp/ is still possible.

<!-- Should probably have a gif or an interactive demonstration of the keypresses -->

This *shifted modifier* transformation system is both ergonomic and unambiguous. Except for certain edge cases for weird spellings like ⟨GitHub⟩ rendering as ⟨Giθub⟩, you can write and use the keyboard normally for English, while being able to type out IPA at the speed of touch typing.

## Assigning the letters

Once we figured out the mechanism, the fun and creative part was figuring out which two-letter mappings corresponded to which sounds. The base Latin alphabet maps exactly to the corresponding IPA letter, and these letters can be thought of as starting points, or bases, which are transformed by shifted, uppercase modifiers.

Initially, the modifiers were selected based on familiarity with various latinizations. We seeded the layout with spellings people already knew — English's own ⟨sh⟩ for /ʃ/ and ⟨th⟩ for /θ/, the Slavic ⟨zh⟩ that spells /ʒ/.

Some symbols in IPA had no good Latin bases or modifiers, like those for /ʔ/, /ʕ/ and /ħ/. For these, we used ⟨2⟩, ⟨3⟩, and ⟨7⟩ as bases, borrowing from the Arabizi convention which Arabic speakers have typed on their phones for twenty years. Other numbers like ⟨4⟩ and ⟨5⟩ for /ɾ/ and middle vowels /ə/ drew from X-SAMPA.

Eventually, some sections of the IPA <!-- describe the creation of rules like the J palatalization rule or whatever and how they cache hit -->

<!-- paragraph dedicated to the design of the vowel transforms -->

Lastly, to cover IPA’s wide range of diacritics, we painstakingly assigned each to <!-- finish this -->

<!-- We should also shoutout the Shift and Option Shift layer, and mention that this is a transcriptionist’s keyboard and it can actually type out a lot of Romanizations -->

## Try it

<!-- There’s also a point I want to shove in somehwere which is that I hope this enables us to do IPA transcription at touch typing speed. And acknowledge Claude and stuff -->

IPAbet is free and open source.
If you’re an Mac person, [you can download the macOS input method](/download).

You can [type IPA in your browser right now](/type) — the same engine, nothing to install — or [learn it properly in an afternoon](/learn). The [full chart](/chart), annotated with every keystroke, is one printable page.
