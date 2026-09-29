# Store release notes — 1.8.3

Paste target for the App Store "What's New" field and the Play Console
release-notes field. The in-app prompt is driven by `supabase-whats-new-v183.sql`
and uses bullets, because `src/components/WhatsNewPrompt.tsx` renders one card
per bullet line and has no concept of a section heading.

The code is all shared, but the two stores sit at different starting points,
so the bodies differ: iOS was last approved at 1.7.8 and needs everything
since then (first body below); Play gets the 1.8.3 changes only (second body,
494 characters, inside Play's 500 cap).

## Does this carry 1.8.2's fix?

Probably yes. The only 1.8.2 build on EAS is iOS 156, which was built from the
flawed expiry check and must not ship; 157/158 and Android 166–169 never
appear there. So 1.8.3 is most likely the first store build since 1.8.1, and
the calendar fix is new to every student. **Before pasting, check App Store
Connect and the Play Console:** if a 1.8.2 build is already live, drop the
`Fixes` heading and item 5 — 1.8.2's notes already said it.

## Title

```
Timetable options and PDF export
```

## Body — App Store (iOS), covering 1.7.8 -> 1.8.3

**Use this one for iOS.** The last build Apple approved is **1.7.8**: 1.7.9
(iOS 151), 1.8.1 (154/155) and 1.8.2 (156) never reached iOS students, so
this body carries all of them. 1.8.1's notes assumed 1.7.9 had shipped and
left out its widgets and 4h/5h classes; they are here.

Dropped for iOS: "Fixed a two-finger touch crash" (1.8.1) — `0d54b28` is an
Android-only gesture-handler patch. Added: the storage-full banner (`5769f01`,
an iOS ENOSPC report), which no earlier notes listed.

1302 characters; the App Store allows 4000.

```
New
1. Lock screen planner: your day as a wallpaper that refreshes each morning
2. Two new lock screen templates, Timetable and Grid: your whole week with rooms
3. Week and Task List widgets for your home screen and lock screen
4. Timetable options: pick grid or list, and choose what each class shows - course name, room, lecturer, group
5. Export your timetable as a PDF, portrait or landscape, to print or share
6. Your lock screen can show your class group, and classes with no room say Online
7. Replies to your confession or comment now notify you, and open the thread
8. Turn reply alerts off per post, or in Community settings
9. Classes can now be 4 or 5 hours long

Improvements
1. Your timetable fits Monday to Friday on one screen, in calmer colours
2. Rencana tells you when your phone is full, instead of edits quietly not saving

Fixes
1. Your semester week is correct again. The app moves on to your new semester, and a week you set by hand no longer carries over
2. Handwriting no longer turns into shapes as you write
3. Smoother zoom in notes, and no more cut-off pages
4. Subject colours match on every device
5. Widgets roll over at midnight again
6. Rooms show on the lock screen's Next line, even on a day with no classes
7. Reply counts on confessions match the replies you see
```

## Body — Play Console (and App Store only if 1.8.2 shipped there)

```
New
1. Lock screen templates Timetable and Grid: your whole week with rooms, to save as wallpaper
2. Timetable options: grid or list, and what each class shows
3. Export your timetable as a PDF, portrait or landscape
4. Lock screen can show your class group; roomless classes say Online
Improvements
5. Your week fits one screen, Monday to Friday, in calmer colours
Fixes
6. Your semester week is right again: the app moves on to your new semester, and a week set by hand no longer carries over
```

## What changed

1. `components/TimetableMenuSheet.tsx` replaces the inline menu on the
   Timetable tab: edit classes, lock screen, grid/list, which details show on
   class cards, all 7 days, reset.
2. `src/lib/timetablePdf.ts` builds a real A4 PDF with pdf-lib (no native
   module) and hands it to the share sheet. It replaces the old screenshot
   export.
3. Lock screen: a Group / section toggle in the Show tab (off by default), and
   "Online" for a class with no room, as the timetable grid already labels it.
4. The week grid is back to its 1.8.0 look — the solid full-colour blocks
   tried during this cycle never shipped. Columns are sized so five days fit;
   course names no longer force seven scrolling columns, and a weekend day
   with a class stays reachable by scrolling. A subject name that is just the
   code is no longer printed twice.
5. Two new lock screen templates, Timetable (a list of each day's classes)
   and Grid (a mini timetable grid), both undated so a picture saved once —
   the only option on Android — stays right all semester. Glance is removed:
   it showed only the first class, wrong from that class onward. A stored
   Glance choice falls back to Today.
6. 1.8.2's calendar work (dev-izwan `4ff37bc`, `a51f45b`, `14168bb`,
   `ef2ea69`): an ended semester is refreshed once its last published period
   is over, including user-chosen calendars; registration rows no longer
   delay that; a hand-set week no longer carries into a new semester.

## Not listed

- New sparkle and game-controller icons on the Study quick actions — cosmetic.
- 1.8.1's handwriting, Android crash and storage-full fixes are already in
  1.8.1's notes.

## Ship order

Already done on the database side, ahead of this build:

- `supabase-fix-uitm-stale-calendars-20264.sql` (run by hand, 28 Sep) moved
  every UiTM student on an ended HEA semester onto 20264 and trimmed Sunday
  lecture ends, so the week is right even on old builds.
- Migration `20260928000002_reset_stale_teaching_week_offset` was pushed on
  28 Sep. 1.8.2's notes asked for it to wait until the build was widely
  installed, because for a student whose calendar was frozen the stale offset
  was their hand-made workaround. For UiTM "Official HEA" calendars that risk
  is gone — the script above had already corrected their dates and zeroed the
  offset. Anyone else with an ended calendar lost the workaround and sees the
  unaligned week until their calendar moves on. This build refreshes an ended
  HEA calendar by itself, `user`-chosen ones included (`isCalendarExpired` in
  `academicUtils.ts`). It does **not** refresh a UiTM community-verified
  calendar (`uitm.ts:41` still leaves those alone) or a custom one — those
  students have to pick their new semester in Academic Calendar.

Run `supabase-whats-new-v183.sql` only once the build is live on both stores.
