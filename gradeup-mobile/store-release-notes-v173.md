# Store release notes — 1.7.3

Paste target for the App Store "What's New" field and the Play Console
release-notes field. This is **not** the in-app copy: the What's New prompt
inside the app is driven by `supabase-whats-new-v173.sql` and uses bullets,
because `src/components/WhatsNewPrompt.tsx` renders one card per bullet line
and has no concept of a section heading. Feeding it the numbered New/Fixes
layout below makes it pair lines up wrongly — "Fixes" ends up as the sub-text
of the MICP item.

So the two copies are deliberately different in wording and layout, but they
must stay the same in substance. Change one, change the other.

Length: 427 characters. Play Console caps release notes at 500; the App Store
allows 4000, so the Play cap is the binding one.

## Title

```
Custom semester weeks and more captures
```

## Body

```
New
1. Set how many teaching weeks your semester runs, instead of a fixed 14
2. Study, exam and break periods follow the week count you set
3. Free plan now gets 3 Smart Captures a day, up from 2
4. MAHSA International College (Penang) is now on the university list

Fixes
1. Your teaching week count no longer resets to 14 when you reopen the app
2. Aligning your teaching week now updates the week shown on Home straight away
```

## Not listed

- Circles and Locations removed from the admin web sidebar (c1e6a9b). Staff
  console only, no student screen changed.

## Ordering

New before Fixes, and within each group the item that reaches the most
students comes first. The teaching-week items reach everyone on a semester
that is not 14 weeks; the Smart Capture cap reaches Free users; MICP reaches
one college.

## Ship order

Item 3 only holds once the `ai_generate` Edge Function is redeployed (4ba47b0).
The Edge Function enforces the cap, so publishing this copy before that deploy
promises a third capture the server still rejects.
