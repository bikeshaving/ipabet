---
title: "Introducing IPAbet"
description: "Designing a better way to type the International Phonetic Alphabet"
date: "2026-07-21"
draft: true
---

The International Phonetic Alphabet (IPA) is the universal standard for documenting human speech, capable of transcribing the sounds of any language on Earth. But if you want to type it today, your options are limited. You can use a website with a virtual keyboard to write out letters one click at a time. Or, if you’re looking for a pure keyboard solution, your best bet might be to install Keyman: a complex tool which sits between your OS and your keyboard, designed less for IPA and more for intricate scripts like Khmer and Tibetan.

As a programmer, this situation has always struck me as absurd. As of this year, IPA is 140 years old. It is used professionally by linguists, language instructors, singers, actors, speech pathologists, news broadcasters — basically anyone who cares about describing and pronouncing speech with scientific precision. Nevertheless, there’s no easy way to type it, even though there are complex input method editors (IMEs) like those for Japanese and Chinese, which allow users to type thousands of individual logographs.

Armed with Claude, who can reasonably vibe-code a macOS IME, and is highly knowledgeable on matters of phonetics and orthography, I set out to create a better way to type IPA. The result is *IPAbet*, a fast and intuitive system designed for phonetic transcription, with native macOS and browser support, in its initial release.

## Designing the keyboard

The challenge of creating a new IPA keyboard has less to do with technical solutions and more to do with design. The problem is primarily one of limited space: while IPA’s range of symbols is smaller than those of other world writing systems — 107 vowels and consonants, plus about 50 diacritics and other markers — this is still way more than can fit on the standard ANSI keyboard, which has only 47 keys for letters, numbers and punctuation. Other IMEs allow you to type out *words* with Latin letters and pick out what you meant from a dropdown list of candidates, but IPA’s letters represent *sounds*, not words, and choosing symbols from a menu was exactly the experience I was trying to avoid.

English solved this problem for some sounds by representing them with two-letter combinations like `sh`, `th`, and `ng`. The `h` and `g` letters in these *digraphs* don’t represent sounds on their own. Rather, they are signals that the previous letter has moved somewhere else in the mouth. These conventions were created organically by scribes and printers hundreds of years ago and have survived in modern English spelling.

What if we could just use two-letter combinations to write IPA? This would solve the space problem: even with only the letter keys, that’s 676 (26²) open slots. And if you could type `th` and produce the IPA `θ` symbol, it would be immediately intuitive for English speakers. But this raises the additional question, how do we allow for two-letter combinations to transform without interrupting normal typing. If typing `th` always produced `θ`, you could no longer type the word “the.”

Fortunately, one thing I realized was that IPA has no capital letters at all, and English only capitalizes the first letter of a word. A capital in the middle of a word means nothing to either language — so that’s where the transformation can live: <Combo keys="t ⇧H" out="θ"/>, while `th` is still just `th`.
