# Store release notes — 1.8.2

Paste target for the App Store "What's New" field and the Play Console
release-notes field. The in-app prompt is driven by `supabase-whats-new-v182.sql`
and uses bullets, because `src/components/WhatsNewPrompt.tsx` renders one card
per bullet line and has no concept of a section heading.

A fix-only release, shipped the same day as 1.8.1 because the bug it addresses
was wrong on screen for thousands of students on the first morning of a new
semester.

Unlike 1.8.1 there is **no platform difference**: both fixes are shared app
code, so the App Store and Play bodies are identical.

Length: 315 characters, comfortably inside Play's 500 cap.

## Title

```
Your semester week is correct again
```

## Body — App Store and Play Console (identical)

```
Fixes
1. Your semester week is correct again. The app now picks up your new semester instead of staying on the old one
2. A week you set by hand no longer carries over into the next semester, so a new semester starts at Week 1
3. Semester Pulse, your timetable week and class reminders all follow the corrected week
```

## What was actually wrong

Two defects that compounded:

1. `calendarProviders/uitm.ts` fetched a calendar once and never again — its
   early return only asked whether the stored dates parsed, which a finished
   semester satisfies as well as a running one. 5,184 active calendars still
   started in March while the new term had begun in late September.
2. `academicCalendarDb.ts` treated an absent `teachingWeekOffset` as "keep the
   existing value", so a manual week alignment survived into the next semester
   and was applied on top of the stale week.

Students reported "Week 10" and "Week 12" on the first day of a semester that
should have read "Week 1".

## Not listed

Item 3 is the consequence of items 1 and 2 rather than a separate fix, but it
is the part a student notices, so it earns its own line.

## Ship order

No migration is required for this build. The cleanup of the 771 calendars that
still carry a stale alignment must wait until this build is widely installed:
for a student whose calendar was frozen, that alignment is the workaround they
applied by hand, and clearing it before the calendar itself is corrected leaves
them worse off than before.
