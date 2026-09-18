ALTER TABLE "SixflTvYoutubePublish"
  ADD COLUMN "notifySubscribers" BOOLEAN,
  ADD COLUMN "notificationDay" DATE;

CREATE UNIQUE INDEX "SixflTvYoutubePublish_one_subscriber_notification_per_day"
  ON "SixflTvYoutubePublish" ("notificationDay")
  WHERE "notifySubscribers" IS TRUE;
