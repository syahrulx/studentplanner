# Rencana 1.9.0 — release notes

iOS build 167 · Android version code 178

Six app changes since 1.8.9 (iOS 166 / Android 177). Everything else since
then was the admin website.

---

## Google Play — "What's new"

> Play allows **500 characters**. The text below is 359.

```
New Snap editor: put up to 4 photos in one snap, add text, draw on it, and pick photos from your gallery.

Pinned tasks and finished study sessions now show on all your devices.

The AI tutor is easier to read.

Notifications for broadcasts, reactions and friend requests now reach everyone.

Fixed: the keyboard no longer covers the text box on newer phones.
```

---

## App Store — "What's New in This Version"

> Apple allows 4,000 characters. The text below is 852.
> No mention of Android or any other platform (2.3.10). The keyboard fix is
> Android-only, so it is in the Play text only.
> **If 1.8.9 never went live on the App Store**, put the 1.8.9 App Store text
> (RELEASE-NOTES-1.8.9.md) under this one, so iPhone users hear about those
> features too.

```
New Snap editor
Make your snap your way. Put two, three or four photos in one snap with six layouts, add text you can drag anywhere, and draw on it in seven colours. You can also pick photos from your gallery now, not just the camera. Your caption is still there too.

Your pins and study ticks, everywhere
Pin a task or mark a study session as done, and it now shows on your other devices and the website too.

An easier AI tutor
The tutor's answers now read as plain text across the screen, like other AI chats. Only your questions sit in a bubble, so long explanations are easier to follow.

Notifications that arrive
Some students were not getting pop-ups for broadcasts, reactions and friend requests. That is fixed.

Also fixed
Drawing on a snap no longer closes the screen by accident, and closing a snap you are still working on now asks first.
```

---

## Notes for us, not for the stores

- **Run `20261013000007_user_planner_state.sql` before or with the release.**
  Without it, pins and study ticks stay on one device (nothing breaks).
  The App Store and Play text both promise the sync.
- **Not tested on a real device:** the snap camera, a real snap post, and
  anything on Android (keyboard fix included).
- The in-app "What's New" popup comes from the server (admin website), not
  from the build. Add a 1.9.0 entry there when you release; no new build
  needed. The Play text above fits it.
- The photo-library permission text now mentions Snap Streak; Apple sees it
  in this build.
