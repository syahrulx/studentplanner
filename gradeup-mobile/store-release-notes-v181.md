# Store release notes — 1.8.1

Paste target for the App Store "What's New" field and the Play Console
release-notes field. This is **not** the in-app copy: the What's New prompt
inside the app is driven by `supabase-whats-new-v181.sql` and uses bullets,
because `src/components/WhatsNewPrompt.tsx` renders one card per bullet line
and has no concept of a section heading. Feeding it the numbered New/Fixes
layout below makes it pair lines up wrongly.

So the two copies are deliberately different in wording and layout, but they
must stay the same in substance. Change one, change the other.

This release covers 1.7.9 -> 1.8.1, not 1.8.0 -> 1.8.1. There is a "release
1.8.0" commit, but no build was ever produced from it: the last build that
reached students was 1.7.9 (iOS 151, Android 163). Everything landed since
then ships here for the first time.

Lengths: iOS body 499 characters, Android body 491. Play Console caps release
notes at 500; the App Store allows 4000, so the Play cap is the binding one
and both bodies are written to it. That cap, not judgement, is why the lines
are this terse and why related fixes are merged.

## Title

```
Lock screen planner, smoother notes
```

## Body — App Store

```
New
1. Lock screen planner: your day as a wallpaper that refreshes each morning
2. Replies to your confession or comment now notify you, and open the thread
3. Turn reply alerts off per post, or in Community settings

Fixes
1. Handwriting no longer turns into shapes as you write
2. Smoother zoom in notes, and no more cut-off pages
3. Subject colours match on every device
4. Widgets roll over at midnight again
5. Rooms show on the Next line, even with no classes
6. Fixed a two-finger touch crash
```

## Body — Play Console

Item 1 under New is the only difference, and it is not cosmetic. Both
platforms can design a lock screen wallpaper and save it. The half that
refreshes it every morning is a Shortcuts automation feeding an App Intent, so
it is iOS only — `lock-wallpaper.tsx` gives Android `lsSavedAndroidHint`,
"Open it in Gallery and set it as your wallpaper", and no automation.
Promising a daily refresh on Play would be promising something the build
cannot do.

```
New
1. Lock screen planner: build your day into a wallpaper and save it
2. Replies to your confession or comment now notify you, and open the thread
3. Turn reply alerts off per post, or in Community settings

Fixes
1. Handwriting no longer turns into shapes as you write
2. Smoother zoom in notes, and no more cut-off pages
3. Subject colours match on every device
4. Widgets roll over at midnight again
5. Rooms show on the Next line, even with no classes
6. Fixed a two-finger touch crash
```

## Not listed

- Admin user search by email and country filter (9d66fec). Staff console only,
  no student screen changed.
- The community-push service-key fix (0f51c0c) and the reply-prefs migration
  re-run fix (179ede4). Both server-side; neither is visible to a student.

## Ordering

New before Fixes. The lock screen planner leads because it is the release's
headline and the only wholly new surface.

Within Fixes the order is by reach. The handwriting and notes fixes come
first because they hit anyone who takes notes, and both were the kind of bug a
student reads as the app breaking their work rather than as a glitch: shape
assist was rewriting letters as circles, and a zoomed page looked like it had
run out of paper when it had not. Subject colours affect anyone with a second
device, widgets anyone with a widget, and the crash needed two fingers on a
list.

"Rooms show on the Next line" sits in Fixes rather than New: the setting
already existed and appeared to do nothing on days without classes.

## Ship order

Items 2 and 3 under New need three migrations run and the `community-push`
Edge Function deployed, or the app promises notifications the server never
sends. Both were done on 2026-09-28, before this copy was written, so the
copy is safe to publish as it stands.
