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
<Constraint name="Only the letter before changes">
A key only ever changes the letter just before it, so what you get never depends on anything earlier.
</Constraint>
<Constraint name="Each capital means one thing">
<kbd>⇧R</kbd> makes a sound retroflex, <kbd>⇧J</kbd> palatal, <kbd>⇧L</kbd> lateral: <Combo keys="t ⇧R" out="ʈ"/> <Combo keys="n ⇧J" out="ɲ"/> <Combo keys="s ⇧L" out="ɬ"/>.
</Constraint>
<Constraint name="Follow familiar spelling">
<kbd>⇧H</kbd> is the h in th, sh and wh: <Combo keys="t ⇧H" out="θ"/> <Combo keys="s ⇧H" out="ʃ"/> <Combo keys="w ⇧H" out="ʍ"/>. <kbd>⇧G</kbd> is the g in ng: <Combo keys="n ⇧G" out="ŋ"/>. The digits come from Arabic chat: <Combo keys="2 ⇧H" out="ʔ"/> <Combo keys="7 ⇧H" out="ħ"/>.
</Constraint>
</Constraints>

## See it

Pick a capital to see which symbols it makes. The slider moves the vowels into acoustic space and the consonants into the mouth. Click a symbol to hear it.

<ChartTitle>Vowels</ChartTitle>
<VowelChart/>
<ChartTitle>Pulmonic consonants</ChartTitle>
<ConsonantChart/>

## Coverage

Every symbol on the IPA chart, and every extIPA diacritic for disordered speech. The extIPA letters ʬ ʭ ʪ ʫ ʩ ꞎ ʞ don't have keys yet.
