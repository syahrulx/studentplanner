# Store release notes — 1.8.3

Paste target for the App Store "What's New" field and the Play Console
release-notes field. The in-app prompt is driven by `supabase-whats-new-v183.sql`
and uses bullets, because `src/components/WhatsNewPrompt.tsx` renders one card
per bullet line and has no concept of a section heading.

No platform difference: everything here is shared app code, so the App Store
and Play bodies are identical.

Length: 497 characters, just inside Play's 500 cap. Without the Fixes section
(see below) it is 362.

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

## Body — App Store and Play Console (identical)

```
New
1. Timetable options: pick grid or list, and choose what each class shows - course name, room, lecturer, group
2. Export your timetable as a PDF, portrait or landscape, to print or share
3. Your lock screen can show your class group, and classes with no room now say Online
Improvements
4. Your week fits one screen again, Monday to Friday, in calmer colours
Fixes
5. Your semester week is correct again. The app moves on to your new semester, and a week you set by hand no longer carries over
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
5. 1.8.2's calendar work (dev-izwan `4ff37bc`, `a51f45b`, `14168bb`,
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
