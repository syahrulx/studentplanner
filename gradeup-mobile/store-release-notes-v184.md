# Store release notes — 1.8.4

Paste target for the App Store "What's New" field and the Play Console
release-notes field. The in-app prompt is driven by `supabase-whats-new-v184.sql`
and uses bullets, because `src/components/WhatsNewPrompt.tsx` renders one card
per bullet line and has no concept of a section heading.

Covers 1.8.3 -> 1.8.4 only. 1.8.3 (iOS 159, Android 170) is live on both
stores, so everything before it has already been announced there.

No platform difference: shared app code, so both bodies are identical. It
matters most on Android, which cannot refresh a wallpaper and so saves the
picture once — that is what the two templates are for.

Length: 318 characters, inside Play's 500 cap.

## Title

```
Your whole week on your lock screen
```

## Body — App Store and Play Console (identical)

```
New
1. Two new lock screen templates: Timetable, your whole week as a list with times and rooms, and Grid, a mini timetable grid
2. Neither shows a date, so on Android you can save one as your wallpaper and it stays right all semester

Changes
1. The Glance template is gone. If you were using it, you're on Today now
```

## What changed

`b61d617`. Two lock screen templates read a new undated model field,
`timetable` (first five week days always, a later day only with a class; blind
to break weeks):

1. Timetable (`TimetableTemplate.tsx`): a line per class — time, code, room,
   and group when that switch is on.
2. Grid (`GridTemplate.tsx`): a column per day, an hour scale, class blocks
   placed by time with the subject colour down the edge.

Neither has a size. Fitting only trims when the card would not fit (lines per
day down to two; the hour down to 22 pt), so no class is hidden while there is
room.

Glance is removed: it drew only the day's first class, so a picture drawn
once a day was wrong from that class on. A stored Glance choice is not in the
template list any more and falls back to the default, Today.

## Not listed

Nothing else user-facing changed between 1.8.3 and 1.8.4.

## Ship order

No migration. Run `supabase-whats-new-v184.sql` only once the build is live on
both stores.
