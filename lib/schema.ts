import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
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
  fromEmail: text("from_email").notNull().default(""),
  replyTo: text("reply_to"),
  physicalMailingAddress: text("physical_mailing_address").notNull().default(""),
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
