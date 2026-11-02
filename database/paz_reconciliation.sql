-- Run in the EXTERNAL application database before using the updated Paz import.
-- No voucher/code SELECT grants, no RLS weakening, no card-number rewrites.
BEGIN;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS card_number text GENERATED ALWAYS AS (serial) STORED;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS redeemed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,
  user_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT '',
  action text NOT NULL, target text NOT NULL DEFAULT '-',
  ip_address text NOT NULL DEFAULT '-', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_log' AND policyname='Import audit admin read') THEN
    CREATE POLICY "Import audit admin read" ON public.activity_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_log' AND policyname='Import audit own insert') THEN
    CREATE POLICY "Import audit own insert" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Canonical matching key only: retain the original stored number for audit/history.
-- Text 019950, numeric Excel 19950 and 19950.0 share a key; nonnumeric IDs
-- remain intact. Never cast to integer (long card numbers must stay exact).
CREATE OR REPLACE FUNCTION public.paz_card_match_key(p_card text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$
  WITH cleaned AS (
    SELECT regexp_replace(translate(p_card, chr(160) || chr(65279), ''), '[[:space:]]', '', 'g') AS value
  ), numeric_text AS (
    SELECT CASE WHEN value ~ '^[0-9]+[.]0+$' THEN split_part(value, '.', 1) ELSE value END AS value FROM cleaned
  )
  SELECT CASE WHEN value ~ '^[0-9]+$' THEN coalesce(nullif(ltrim(value, '0'), ''), '0') ELSE value END FROM numeric_text
$$;
REVOKE ALL ON FUNCTION public.paz_card_match_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paz_card_match_key(text) TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS vouchers_paz_match_key_idx ON public.vouchers(public.paz_card_match_key(card_number));

CREATE OR REPLACE FUNCTION public.reconcile_redeemed_vouchers(card_numbers text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE keys text[]; changed_cards text[]; n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  SELECT array_agg(DISTINCT public.paz_card_match_key(x)) INTO keys
    FROM unnest(card_numbers) AS input(x) WHERE nullif(public.paz_card_match_key(x), '') IS NOT NULL;
  IF coalesce(cardinality(keys), 0)=0 THEN RAISE EXCEPTION 'Card numbers required'; END IF;

  -- Protect against a concurrent import/issue changing the matching set. Any
  -- ambiguous normalized identity aborts everything, rather than redeeming
  -- two different physical cards (e.g. both 019950 and 19950 in inventory).
  LOCK TABLE public.vouchers IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.vouchers v WHERE public.paz_card_match_key(v.card_number)=ANY(keys)
    GROUP BY public.paz_card_match_key(v.card_number) HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'נמצאו מספרי כרטיסים דו־משמעיים לאחר הסרת אפסים מובילים; יש לבדוק את המלאי לפני הייבוא';
  END IF;

  WITH changed AS (
    UPDATE public.vouchers v
      SET status='redeemed', redeemed_at=coalesce(v.redeemed_at, now()),
          updated_on=to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD')
      WHERE public.paz_card_match_key(v.card_number)=ANY(keys)
        AND (v.status IN ('available', 'issued', 'טרם שומש', 'הוקצה לעובד', 'מומש בפועל', 'מומש סופית')
          OR (v.status='redeemed' AND v.redeemed_at IS NULL))
      RETURNING v.card_number
  ) SELECT count(*)::integer, array_agg(card_number ORDER BY card_number) INTO n, changed_cards FROM changed;

  -- Same transaction as redemption: an audit failure rolls the update back.
  INSERT INTO public.activity_log(user_id, user_name, role, action, target)
    VALUES(auth.uid(), coalesce((SELECT full_name FROM public.profiles WHERE id=auth.uid()), ''),
      'אדמין מרכזי', 'היזון חוזר מימושים מפז',
      n || ' שוברים עודכנו למומש סופית · מספרי כרטיסים: ' || coalesce(array_to_string(changed_cards, ', '), 'ללא'));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_redeemed_vouchers(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_redeemed_vouchers(text[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Read-only verification (no redemption codes):
-- SELECT card_number, status, redeemed_at FROM public.vouchers WHERE status='redeemed';
-- SELECT action, target, created_at FROM public.activity_log WHERE action='היזון חוזר מימושים מפז' ORDER BY created_at DESC LIMIT 20;