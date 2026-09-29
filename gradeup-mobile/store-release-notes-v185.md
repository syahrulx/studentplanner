# Store release notes — 1.8.5

Paste target for the App Store "What's New" field and the Play Console
release-notes field. The in-app prompt is driven by `supabase-whats-new-v185.sql`
and uses bullets, because `src/components/WhatsNewPrompt.tsx` renders one card
per bullet line and has no concept of a section heading.

## Range: 1.8.4 -> 1.8.5

A small release, and for once that is the truth rather than a bookkeeping
accident. 1.8.4 really did ship — iOS 160 is in review and Android 171 is
rolling out — so only what landed after its release commit belongs here.

`store-release-notes-v184.md` was briefly rewritten to cover 1.8.1 -> 1.8.4 on
the belief that 1.8.4 had never been built. It had; it was built locally, and
`eas build:list` only reports cloud builds. That file is now history.

## Lengths

248 characters, the same body on both stores. Play caps at 500 and the App
Store at 4000, so nothing had to be cut and the two can stay identical — the
first time in this run of releases that has been true.

## Title

```
12-hour time, and two fixes
```

## Body — App Store and Play Console (identical)

```
New
1. 12-hour time. Switch your timetable to 1:00 PM instead of 13:00, under timetable options

Fixes
1. Friend requests now say what actually happened instead of "something went wrong"
2. The small Classes widget shows four classes again, not two
```

## Notes on the wording

"not two" earns its place on the widget line. A student who never counted
would not notice the fix; one who did lost half their day off the widget and
will recognise the number.

The friend line quotes the old message on purpose. It is what the student saw,
repeatedly, while tapping Add on someone who was already their friend.

## Not listed

- The friendships integrity migration and its duplicate cleanup. Server work;
  what a student notices is the message, which is line 1 of Fixes.

## Ship order

`20260929000001_friendships_integrity` must be run before this build reaches
students. The new code reads a pair as a list and reports what a failed
request actually was, and that relies on one row per pair.
