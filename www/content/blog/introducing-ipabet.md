---
title: "Introducing IPAbet"
description: "Designing a better way to type the International Phonetic Alphabet"
date: "2026-07-21"
draft: true
---

The International Phonetic Alphabet (IPA) is the universal standard for documenting human speech, capable of transcribing all the sounds of any language on Earth. But if you want to type it today, your options are limited. You can use a website with a virtual keyboard to write out letters one click at a time. Or if you’re looking for a pure typing solution, you can install Keyman: a complex tool which sits between your OS and your keyboard, designed less for IPA and more for intricate scripts like Khmer or Tibetan.

As a programmer, this situation has always struck me as absurd. IPA is nearing 140 years old. It is used professionally by linguists, language instructors, singers, actors, speech pathologists, news broadcasters — basically anyone who cares about describing and pronouncing speech with scientific precision. Nevertheless, there’s no easy way to type it, unlike languages like Chinese and Japanese, which use complex input method editors (IMEs) to map Latin characters to thousands of logographs.

Armed with Claude, who can reasonably vibe-code a macOS IME, and is knowledgable about phonetics and orthography, I set out to create a better way to type IPA. The result is *IPAbet*, a fast and intuitive system designed for phonetic transcription, with native macOS and web support.

The challenge of creating a new IPA keyboard has less to do with engineering technical solutions and more to do with design. The problem is primarily one of space. While IPA’s range of symbols is smaller than those of other world writing systems — officially 107 vowels and consonants, plus around 50 diacritics and other markers — this is still way more than can be represented on the standard ANSI keyboard, which has only 47 keys for letters, numbers and punctuation. Other IMEs, like those for Japanese and Chinese, allow you to type out words with Latin letters and pick what you meant from a list of candidates. But IPA’s letters represent sounds, not words, and selecting them from a menu was exactly the experience I was trying to avoid.

English solved this problem about 1000 years ago by representing sounds with two-letter combinations (`sh`, `th`, `ng`). The `h` and `g` in these *digraphs* don’t represent sounds on their own. Instead, they are signals that the previous letter has moved somewhere else in the mouth. These conventions were created organically by scribes and printers millenia ago, and have lasted into modern English spelling.

With this in mind, I wondered if a keyboard that somehow transformed two-letter combinations into IPA letters would solve the problem. Having classes gives us 676 (26²) slots for non-IPA letters.
