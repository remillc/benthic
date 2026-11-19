# Maintenance tasks

Recurring work that keeps OpenDives up to date. Add a note here whenever a decision creates a task that must be repeated.

## When Subsurface publishes a new version of its core

OpenDives reuses Subsurface's C++ core as is (pinned in `third_party/subsurface/`). When Subsurface releases a new version of its core code, OpenDives must be updated to follow it:

- Move the pinned Subsurface submodule to the new version.
- Run the version lock check and the tests that compare against the core (planner, ZH-L16C, gas tools, git round trip), then fix what breaks.
- Release a new version of the app.

Decided by Christian on 19 November 2026.

## When libdivecomputer is updated

libdivecomputer is pinned inside the Subsurface submodule, so it moves with the core. Whenever it is updated:

- Update the dive computer images. They are hosted on the OpenDives+ server, are free for everyone (decided 19 November 2026, to show the quality of the app), so they must be downloadable without an account, and the app downloads each one on demand, then keeps it on the device for good (idea #65, decided 19 November 2026). New models in libdivecomputer need their image added to the server.
- Check that the manufacturer and model pairs in the app still match the libdivecomputer list.

Decided by Christian on 19 November 2026: the images are updated when libdivecomputer is updated.
