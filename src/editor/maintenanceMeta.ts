/**
 * Meta flag for transactions a plugin *appends* to keep derived content in sync
 * — footnote renumbering, section rebuilding, and the like — as opposed to a
 * user's own edit.
 *
 * TrackChanges skips transactions carrying this flag, so automated housekeeping
 * never shows up as tracked insertions/deletions. It's kept separate from the
 * history's `addToHistory` flag on purpose: the footnotes plugin needs its
 * maintenance to stay in the undo stack (so one Ctrl+Z restores a note with its
 * content), yet must still be invisible to change tracking.
 */
export const MAINTENANCE_META = "isMaintenanceTransaction";
