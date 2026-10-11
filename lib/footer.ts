// Shared footer pieces, used by both the real email (lib/email.ts) and the in-editor
// preview (components/Preview.tsx) so the two can't drift apart.

// One-line "why you're getting this" note shown under the divider. Only rendered for real
// sends and the admin preview — never on the public "view in browser" page, where the
// reader isn't a subscriber being emailed.
export const FOOTER_REASON = "You're getting this because you subscribed at danbenson.me.";
