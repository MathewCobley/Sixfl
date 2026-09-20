-- Allow the private comparison renderer to store a separate alternative highlights preview.
-- Thumbnail and YouTube publish tables intentionally remain limited to HIGHLIGHTS/FULL_MATCH.
ALTER TABLE "SixflTvRenderJob" DROP CONSTRAINT IF EXISTS "SixflTvRenderJob_kind_check";
ALTER TABLE "SixflTvRenderJob"
  ADD CONSTRAINT "SixflTvRenderJob_kind_check"
  CHECK ("kind" IN ('HIGHLIGHTS','HIGHLIGHTS_ALT','FULL_MATCH'));
