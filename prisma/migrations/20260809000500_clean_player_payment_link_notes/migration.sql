-- Player payment-link amounts are structured in PlayerMatchFee.amountPence.
-- Older captain collection updates appended a new generated note each time the
-- amount changed, leaving misleading histories such as £4 followed by £6.
-- Remove only those generated payment-link lines; preserve genuine audit notes.
WITH cleaned AS (
  SELECT
    fee.id,
    NULLIF(
      btrim(
        COALESCE(
          string_agg(lines.line, E'\n' ORDER BY lines.ordinality)
            FILTER (
              WHERE btrim(lines.line) NOT LIKE 'SIXFL player payment link:%'
            ),
          ''
        )
      ),
      ''
    ) AS cleaned_note
  FROM "PlayerMatchFee" AS fee
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(fee.note, ''), E'\n')
    WITH ORDINALITY AS lines(line, ordinality)
  WHERE fee.note IS NOT NULL
    AND fee.note LIKE '%SIXFL player payment link:%'
  GROUP BY fee.id
)
UPDATE "PlayerMatchFee" AS fee
SET note = cleaned.cleaned_note
FROM cleaned
WHERE fee.id = cleaned.id
  AND fee.note IS DISTINCT FROM cleaned.cleaned_note;
