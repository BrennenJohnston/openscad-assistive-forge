# Screen reader lessons

Rules I hold this app's screen-reader support to, learned the hard way on
a sibling project (a braille embosser generator) through real NVDA
sessions and their speech logs. The headline: **measured correct is not
heard correct.** That project scored Lighthouse 100/100 while carrying
eleven live contrast failures and three silent live regions, and its
first real NVDA run took 34 minutes instead of the estimated 12. Probes
and audits inform; only a person listening decides. Until a listening run
happens, results here are recorded as *measured*, never as *heard*.

## The rules

1. **A description helpful once is noise the eighteenth time.** One
   `aria-describedby` paragraph was spoken eighteen times in one
   34-minute session — three long descriptions were 54% of everything
   NVDA said. The working numbers: a 15-word target and a 25-word hard
   ceiling for `aria-describedby` text. This is about *delivery*, not
   deletion: text over the ceiling stays visible on the page and simply
   is not wired into the description — or the description points at a
   span around the first sentence while the rest remains readable in
   place. Never collapse such a span back onto its container; that
   silently restores the full paragraph to every focus pass.

2. **One action, one announcement.** A single keystroke once stacked
   three utterances (character echo, a cleared-field notice, a
   capitalization note — each individually correct). A state change that
   rewrites five controls at once should speak one composed sentence,
   not five. When two conditions genuinely coincide, write them into the
   live region together as one message rather than letting one replace
   the other.

3. **Live regions do not de-duplicate.** The same sentence written twice
   is spoken twice — one warning repeated eleven times over eleven
   keystrokes. Re-announcing an unchanged state is a bug; a live region
   write needs a reason.

4. **Silence is not always a bug.** NVDA suppresses a description that
   merely duplicates the accessible name. Before recording an expected-
   but-unheard announcement as a defect, check whether it repeats the
   label — a finding on the sibling project evaporated exactly this way.

5. **Navigation is landmarks, headings and the elements list before it
   is Tab.** Screen reader users move by structure. The audit questions
   that matter: does the skip link actually skip anything (theirs
   bypassed zero controls — all the chrome sat inside `<main>`)? How
   many tab stops come before the first control that does the app's
   job (theirs: 14)? Does anything announce "out of form" right before
   a primary action? Audit the page as a navigation *system*, not as
   attributes on elements.

6. **The NVDA speech log is the instrument.** `%TEMP%\nvda.log` at
   Input/Output level records what was actually spoken — windowed to the
   browser-focused segment, because it also records NVDA reading the
   terminal beside the browser.

## How this app applies them

The audit that accompanies this note walks the page by landmarks,
headings and the form-field list; inventories every live region and
announcer call site; measures every `aria-describedby` in words; and
catalogues which single actions produce more than one utterance. Fixes
follow the smallest-change rule, every changed string is flagged for
review, and anything measurement cannot settle is a listed decision, not
a silent edit. The companion listening pack
(`docs/notes/NVDA_LISTENING_PACK.md`) is the future listening run's
script — the step this note keeps insisting no measurement can replace.
