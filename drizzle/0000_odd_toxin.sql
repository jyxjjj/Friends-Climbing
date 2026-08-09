CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`real_name` text NOT NULL,
	`base_weight` real NOT NULL,
	`base_body_fat` real NOT NULL,
	`equipment_notes` text DEFAULT '' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `members_nickname_idx` ON `members` (`nickname`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`category` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photos_record_idx` ON `photos` (`record_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`route_name` text NOT NULL,
	`difficulty` text NOT NULL,
	`trip_date` text NOT NULL,
	`planned_distance` real NOT NULL,
	`planned_duration` integer NOT NULL,
	`planned_elevation` integer NOT NULL,
	`participants_json` text NOT NULL,
	`budget_json` text NOT NULL,
	`equipment` text DEFAULT '' NOT NULL,
	`risks` text DEFAULT '' NOT NULL,
	`water_points` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plans_trip_date_idx` ON `plans` (`trip_date`);--> statement-breakpoint
CREATE INDEX `plans_creator_idx` ON `plans` (`created_by`);--> statement-breakpoint
CREATE TABLE `trip_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_plan_id` text,
	`route_name` text NOT NULL,
	`difficulty` text NOT NULL,
	`trip_date` text NOT NULL,
	`actual_distance` real NOT NULL,
	`actual_duration` integer NOT NULL,
	`actual_elevation` integer NOT NULL,
	`participants_json` text NOT NULL,
	`expenses_json` text NOT NULL,
	`body_data_json` text NOT NULL,
	`road_condition` text DEFAULT '' NOT NULL,
	`route_risk` text DEFAULT '' NOT NULL,
	`experience` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_trip_date_idx` ON `trip_records` (`trip_date`);--> statement-breakpoint
CREATE INDEX `records_creator_idx` ON `trip_records` (`created_by`);--> statement-breakpoint
CREATE INDEX `records_plan_idx` ON `trip_records` (`source_plan_id`);