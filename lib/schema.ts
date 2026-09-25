import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const subscriberStatus = pgEnum("subscriber_status", [
  "pending",
  "subscribed",
  "unsubscribed",
  "bounced",
  "complained",
]);

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "sending",
  "sent",
]);

export const sendStatus = pgEnum("send_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "failed",
]);

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  status: subscriberStatus("status").notNull().default("pending"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default(""),
  subject: text("subject").notNull().default(""),
  preheader: text("preheader"),
  markdownBody: text("markdown_body").notNull().default(""),
  heroImageUrl: text("hero_image_url"),
  heroImageAlt: text("hero_image_alt"),
  status: campaignStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const sends = pgTable("sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  subscriberId: uuid("subscriber_id").notNull().references(() => subscribers.id),
  status: sendStatus("status").notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromName: text("from_name").notNull().default(""),
  // The newsletter's public title (e.g. "3 Stops from Main"), distinct from fromName
  // (the compliance sending identity, e.g. "Dan Benson" — CAN-SPAM/GDPR requires an
  // accurate sender, which may be a personal name rather than the publication's brand).
  // Used anywhere copy needs to name the newsletter itself, starting with the
  // double opt-in confirmation email (lib/transactional.ts). Null/empty = confirmation
  // copy falls back to generic phrasing rather than showing a blank.
  newsletterName: text("newsletter_name"),
  fromEmail: text("from_email").notNull().default(""),
  replyTo: text("reply_to"),
  // "New subscriber" owner notification (separate from replyTo, which is subscriber-facing).
  // Sent only after a subscriber confirms via double opt-in, not on initial signup.
  // notifyEmail null/empty = notifications are effectively off even if the toggle is on,
  // since there's nowhere to send them.
  notifyOnNewSubscriber: boolean("notify_on_new_subscriber").notNull().default(true),
  notifyEmail: text("notify_email"),
  physicalMailingAddress: text("physical_mailing_address").notNull().default(""),
    // Optional, customizable via Settings UI. Rendered centered in the compliance
    // footer (lib/email.ts), above the fromName/address line. Null/empty = omitted.
    footerTagline: text("footer_tagline"),
  // Branding: sampled from the real danbenson.me site (WordPress "minimalio" theme)
  // so campaign emails and the view-in-browser page match its light/dark look.
  fontFamily: text("font_family").notNull().default('Inconsolata, ui-monospace, "SF Mono", Menlo, monospace'),
  lightBg: text("light_bg").notNull().default("#f7f7f7"),
  lightText: text("light_text").notNull().default("#191919"),
  lightMuted: text("light_muted").notNull().default("#717171"),
  darkBg: text("dark_bg").notNull().default("#1a1a1a"),
  darkText: text("dark_text").notNull().default("#e8e8e8"),
  darkMuted: text("dark_muted").notNull().default("#717171"),
});

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  alt: text("alt"),
  size: integer("size").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

// Reusable starting points for new campaigns, authored separately (not tied to any
// real campaign). Creating a campaign "from a template" copies these fields into a new
// campaign row — there's no live link back, so editing a template never affects
// campaigns already created from it.
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default(""),
  markdownBody: text("markdown_body").notNull().default(""),
  heroImageUrl: text("hero_image_url"),
  heroImageAlt: text("hero_image_alt"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
