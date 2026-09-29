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

Length: 471 characters, inside Play's 500 cap.

## Title

```
Your whole week on your lock screen
```

## Body — App Store and Play Console (identical)

```
New
1. Lock screen templates Timetable and Grid: your whole week with times and rooms
2. Neither shows a date, so on Android you can save one as your wallpaper and it stays right all semester
3. Friend search shows who's already a friend or has a request waiting, and lets you accept right there

Changes
1. The Glance template is gone. If you used it, you're on Today now

Fixes
1. Adding someone who's already your friend now says so, instead of "Something went wrong"
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

`587fb70`. Friends: search shows Friends / Sent / Accept instead of "Add" for
everyone, and a request that can't be sent says why ("Already friends",
"Already sent", "You're now friends") instead of "Something went wrong". The
database side (one row per pair, only the addressee accepts, only the blocker
unblocks) went out as migration `20260929000001` ahead of the build, so it
already holds for 1.8.3.

## Not listed

The friendship RLS and trigger hardening — not something to advertise, and
already live for every build.

## Ship order

No migration. Run `supabase-whats-new-v184.sql` only once the build is live on
both stores.
