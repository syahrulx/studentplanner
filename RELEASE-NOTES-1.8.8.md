# Rencana 1.8.8 — release notes

iOS build 164 · Android version code 175

Twenty-five commits since 1.8.7. Mostly the community side: profile cards,
snaps, confessions — plus one fix that unblocks Google Classroom for thousands
of students on Android.

---

## Google Play — "What's new"

> Play allows **500 characters**. The text below is 476.

```
Your own profile card. Tap anyone's name to see who they are, and pick a banner for yours — ten colours on Plus, four animated designs on Pro.

Classroom now connects on Android however you signed up. Before, it only worked if you had used Google.

Snaps: see who liked one, tap to move to the next, and read ones step aside.

Confessions now read like people talking, not row numbers.

A bigger map, and animations that work offline.
```

---

## App Store — "What's New in This Version"

```
Your profile card
Tap a student's name or picture anywhere in Community and you get their card: photo, name, university, campus, course, what they are doing and what they are listening to. You decide what yours shows — six switches, or hide the lot in one tap. Hiding your picture shows your initials instead.

Banners
Your card gets a strip you can choose. Ten muted colours on Plus. Four animated designs on Pro: petals falling, drifting light, a scrolling grid, and a pixel sky. They are drawn by the app rather than loaded as pictures, so they are sharp on any screen and cost nothing to download.

Google Classroom on Android
Connecting Classroom used to depend on how you created your Rencana account. If you signed up with Apple or with an email address there was no way to connect it at all, and the app told you to sign in with Google — which you could not do. Android now asks Google properly, whoever you are.

Snaps
See who liked a snap, not just how many. Write a caption before you post. Tap a snap to move to the next one. Snaps you have already opened move aside and stop glowing, so the row shows what is left. Every snap now says whether it went to friends, your campus or your university. And there are more reactions than the six on the bar.

Confessions
A confession used to open with its number. It now opens with a name, from the same set the replies use, so a thread reads like people talking instead of a filing reference. Your name is fixed inside one conversation and different in the next.

A bigger map
The row of buttons above the map moved onto it, and the friends panel is shorter with the snaps now scrolling along with your friends. The map is about a third larger.

Animations that work offline
The cat and spider animations fetched part of themselves from the internet every time they played, so with no signal they never appeared — including the loading spinner, which you need most when the connection is bad. They are built in now.

Also fixed
Tapping a friend's picture in the list did nothing at all; it opens their card now. Admin broadcasts opened a screen that could never show them. Flashcards no longer jump in size as you swipe. And "Theme colour" on your profile now means the colour your theme actually uses.
```

---

## Notes for us, not for the stores

- **Android is unverified.** Everything in this release was tested on an iPhone
  simulator only. The riskiest piece is the row of map buttons, which now
  floats over the Mapbox view.

- **Classroom on Android needs a check in Google Cloud Console** before you
  trust it. The Android OAuth client must carry the package name
  `com.aizztech.rencana` and the SHA-1 of both the upload key and Play App
  Signing. If a fingerprint is missing, Google refuses the sign-in. This is the
  single most valuable fix in the release and the one I could not test.

- **The lock veil on paid banners has never been seen.** Your account is Pro,
  so nothing locks. The tiers themselves were checked by forcing each plan in
  turn; only the padlock on a genuinely locked account is unproven.

- **The snap audience pill was not seen either.** The simulator's Expo dev-menu
  overlay wedged open and took every tap.

- **The build archive is 371 MB.** EAS says so on every upload. A `.easignore`
  would cut the upload time noticeably; still not added.

## Database

Six migrations went to production during this cycle, all already applied:

- `profile_card` — two nullable columns on `profiles`
- `profile_card_status_song`, `profile_card_photo_field` — widening the allowed
  hidden-field list
- `owner_banner_guard` — one banner, one account
- `admin_confession_comment_alias` — **and the migration after it that repaired
  it.** The first selected a column that does not exist, so the admin reply list
  returned nothing for about twenty minutes. Read-only; nothing was lost.

## Not fixed, still open

- Android PDF notes come out blank. The code was written on 1 October and has
  still never run on an Android phone.
- An empty note folder lives only on the device that made it.
- The timetable does not show for some users — still no example account.
- The planner's Week view opens at 3am when the week has no tasks.
- Mono and Spider draw every class grey. Waiting on your decision.
- `PlaygroundCatLottie` and 288 KB of `cat-playground.json` are dead and still
  shipping.

## Still to run

- Delete crossword test puzzle id 31
- Reset the crossword scores on `a44b03d4-…`
- The Snap Streak audience statements

## Data on your account from testing

About ten flashcard reviews, and a CSP650 grade component "Test 1" at 40%
weight, score 78. Remove whenever.
