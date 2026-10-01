# Store release notes — 1.8.4

Paste target for the App Store "What's New" field and the Play Console
release-notes field. The in-app prompt is driven by `supabase-whats-new-v184.sql`
and uses bullets, because `src/components/WhatsNewPrompt.tsx` renders one card
per bullet line and has no concept of a section heading.

## Range: 1.8.1 -> 1.8.4, not 1.8.3 -> 1.8.4

1.8.2 and 1.8.3 were never built. Neither was 1.8.0. The last build that
reached students is **1.8.1** (iOS 155, Android versionCode 166), so
everything in those three versions arrives here at once and the copy has to
carry all of it. That is why this file replaced a shorter one written when
1.8.4 looked like its own small release, and why `store-release-notes-v183.md`
is now history rather than a paste target — its contents are folded in below.

## Lengths

App Store 780 characters, Play 493. Play caps release notes at 500 and the App
Store at 4000, so for once the two bodies differ in substance and not just
wording: the App Store body says things the Play one has no room for. Where
Play forced a cut, the more-felt item won.

Cut from the Play body, in order of what went first:
- the template names (Today, Week, Timetable, Grid)
- "and a week you set by hand no longer carries over" — the semester-week fix
  keeps its headline, loses its detail
- "Rencana warns you when your phone is full"
- "instead of \"something went wrong\"" on the friend-request line

## Title

```
Your week on your lock screen
```

## Body — App Store

```
New
1. Lock screen planner: your day or week as a wallpaper, with Today, Week, Timetable and Grid templates
2. Week and Task List widgets for home and lock screen
3. Timetable options: grid or list, pick what each class shows, and 12-hour time
4. Export your timetable as a PDF
5. Confession replies notify you, and can be turned off per post

Fixes
1. Your semester week is correct again, and a week you set by hand no longer carries over
2. Handwriting stays as you wrote it
3. Smoother zoom in notes, and no more cut-off pages
4. The small Classes widget shows four classes again
5. Subject colours match on every device
6. Widgets roll over at midnight again
7. Friend requests say what went wrong instead of "something went wrong"
8. Rencana warns you when your phone is full
```

## Body — Play Console

```
New
1. Lock screen planner: your day or week as a wallpaper
2. Week and Task List widgets
3. Timetable options: grid or list, what each class shows, 12-hour time
4. Export your timetable as a PDF
5. Confession replies notify you, and can be turned off

Fixes
1. Your semester week is correct again
2. Handwriting stays as you wrote it
3. Smoother zoom in notes, no cut-off pages
4. Widgets show the right day and four classes
5. Subject colours match on every device
6. Friend requests say why
```

## Not listed

- The two-finger crash on a scrolling list. Real and fatal, but a student who
  hit it has no name for it, so the line would mean nothing to them.
- Admin user search, the community-push key fix, and the friendships integrity
  migration. Staff console and server work.
- The Glance lock screen template is gone. Anyone using it is on Today now.
  Worth a line if the in-app prompt has room; it is not worth one of the very
  few the stores allow.

## Ship order

The `20260929000001_friendships_integrity` migration must be run before this
build reaches students: the app now reads a pair as a list and reports what a
failed request actually was, which relies on one row per pair.
