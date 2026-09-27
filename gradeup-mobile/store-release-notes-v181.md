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

Lengths: iOS body 497 characters, Android body 489. Play Console caps release
notes at 500; the App Store allows 4000, so the Play cap is the binding one
and both bodies are written to it.

## Title

```
Lock screen planner, and widgets that keep up
```

## Body — App Store

```
New
1. Lock screen planner: your day as a wallpaper that refreshes each morning
2. Replies to your confession or comment now notify you, and open the thread
3. Turn reply alerts off per post, or all at once in Community settings
4. Rooms now show on the Next line, even on days with no classes

Fixes
1. Subject colours now match on every device, not just the one you set them on
2. Timetable and task widgets roll over at midnight again
3. The app now tells you when your device is out of storage
```

## Body — Play Console

Item 1 is the only difference, and it is not cosmetic. Both platforms can
design a lock screen wallpaper and save it. The half that refreshes it every
morning is a Shortcuts automation feeding an App Intent, so it is iOS only —
`lock-wallpaper.tsx` gives Android `lsSavedAndroidHint`, "Open it in Gallery
and set it as your wallpaper", and no automation. Promising a daily refresh
on Play would be promising something the build cannot do.

```
New
1. Lock screen planner: build your day into a wallpaper and save it
2. Replies to your confession or comment now notify you, and open the thread
3. Turn reply alerts off per post, or all at once in Community settings
4. Rooms now show on the Next line, even on days with no classes

Fixes
1. Subject colours now match on every device, not just the one you set them on
2. Timetable and task widgets roll over at midnight again
3. The app now tells you when your device is out of storage
```

## Not listed

- Admin user search by email and country filter (9d66fec). Staff console only,
  no student screen changed.
- The community-push service-key fix (0f51c0c) and the reply-prefs migration
  re-run fix (179ede4). Both server-side; neither is visible to a student.

## Ordering

New before Fixes. The lock screen planner leads because it is the release's
headline and the only wholly new surface. Within Fixes the order is by reach:
subject colours affect anyone with more than one device, the widget rollover
affects anyone with a widget, and the storage warning is rare but severe when
it happens.

## Ship order

Items 2 and 3 under New need three migrations run and the `community-push`
Edge Function deployed, or the app promises notifications the server never
sends. Both were done on 2026-09-28, before this copy was written, so the
copy is safe to publish as it stands.
