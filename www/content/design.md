---
title: The design of IPAbet
description: "How IPAbet chooses its keys: plain keys stay plain, every symbol is at most two keys, and each capital names the change it makes."
---

<Lede>Most IPA symbols are a letter and one capital: <Combo keys="s ⇧H" out="ʃ"/> <Combo keys="t ⇧R" out="ʈ"/> <Combo keys="n ⇧G" out="ŋ"/>. Five rules decide which.</Lede>

## The rules

<Constraints>
<Constraint name="Plain keys stay plain">
A letter that is already an IPA symbol types itself: <Combo keys="s" out="s"/> <Combo keys="t" out="t"/> <Combo keys="m" out="m"/>.
</Constraint>
<Constraint name="Two keys at most">
Every symbol is a letter, or a letter and one capital: <Combo keys="t ⇧R" out="ʈ"/>. Accents are separate keys on <kbd>⌥</kbd>.
</Constraint>
<Constraint name="Only the last letter changes">
A key only ever changes the letter just before it, so what you get never depends on anything earlier.
</Constraint>
<Constraint name="The capital names the change">
<kbd>⇧R</kbd> makes a letter retroflex, <kbd>⇧J</kbd> palatal, <kbd>⇧W</kbd> rounded. <kbd>⇧H</kbd> works like the h in English spelling: <Combo keys="t ⇧H" out="θ"/> <Combo keys="s ⇧H" out="ʃ"/> <Combo keys="i ⇧H" out="ɪ"/>. Voicing comes from the letter, as in <kbd>s</kbd> and <kbd>z</kbd>.
</Constraint>
<Constraint name="Borrow what people know">
Spellings people already use: <Combo keys="n ⇧G" out="ŋ"/> from ng, <Combo keys="w ⇧H" out="ʍ"/> from wh, and the digits of Arabic chat, <Combo keys="2 ⇧H" out="ʔ"/> <Combo keys="7 ⇧H" out="ħ"/>.
</Constraint>
</Constraints>

## Where the rules bend

A few sounds are too far from any letter. <Glyph>ʝ</Glyph> is <Combo keys="g ⇧J"/>, which is close but not exact.

## See it

Pick a capital to see which symbols it makes. The slider moves the vowels into acoustic space and the consonants into the mouth. Click a symbol to hear it.

<ChartTitle>Vowels</ChartTitle>
<VowelChart/>
<ChartTitle>Pulmonic consonants</ChartTitle>
<ConsonantChart/>

## Coverage

Every symbol on the IPA chart, and every extIPA diacritic for disordered speech. The extIPA letters ʬ ʭ ʪ ʫ ʩ ꞎ ʞ don't have keys yet.
