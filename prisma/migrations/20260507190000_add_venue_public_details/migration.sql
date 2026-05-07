-- Add public-facing venue details used by admin venue management and future league launch pages.
ALTER TABLE "Venue"
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "websiteUrl" TEXT,
ADD COLUMN "googleMapsUrl" TEXT,
ADD COLUMN "parkingNotes" TEXT,
ADD COLUMN "pitchNotes" TEXT,
ADD COLUMN "facilities" TEXT;
