CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.branches (id text PRIMARY KEY, name text NOT NULL, manager text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.issue_reasons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category text NOT NULL DEFAULT 'Regular', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.b2b_clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_code text NOT NULL, account_name text NOT NULL, client_name text NOT NULL DEFAULT '', branch text NOT NULL DEFAULT '', standard text NOT NULL DEFAULT '', balance text, load_type text, budget_section text, account_key text, item_family text, account_status text, account_type text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (client_code, account_name));
CREATE TABLE public.regular_clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id text NOT NULL, client_name text NOT NULL DEFAULT '', site_id text NOT NULL, site_name text NOT NULL DEFAULT '', standard text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (client_id, site_id));
CREATE TABLE public.vouchers (serial text PRIMARY KEY, real_code text NOT NULL DEFAULT '', amount integer NOT NULL DEFAULT 100, branch text NOT NULL DEFAULT 'מאגר ראשי', supervisor text, client text, status text NOT NULL DEFAULT 'טרם שומש', updated_on text NOT NULL DEFAULT to_char(now(),'YYYY-MM-DD'), requester text, approver text, client_id text, site_id text, site_name text, reason text, worker_name text, worker_id text, delivered_at text, route text, link_id text, client_code text, account_name text, standard text, license_plate text, driver_name text, standard_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.app_users (national_id text PRIMARY KEY, last_name text NOT NULL DEFAULT '', first_name text NOT NULL DEFAULT '', role app_role NOT NULL DEFAULT 'supervisor', title text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', branch text NOT NULL DEFAULT '', can_request boolean NOT NULL DEFAULT false, requires_password_change boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.voucher_requests (id text PRIMARY KEY, requester text NOT NULL, requester_id text NOT NULL DEFAULT '', branch text NOT NULL, amount integer NOT NULL, reason text NOT NULL DEFAULT '', created_on text NOT NULL, status text NOT NULL DEFAULT 'ממתין לאישור', approved_amount integer, approver text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.worker_links (id text PRIMARY KEY, total integer NOT NULL, serials text[] NOT NULL DEFAULT '{}', created_on text NOT NULL, worker_id text, phone text, signed_at text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.app_settings (key text PRIMARY KEY, balance integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.app_settings (key, balance) VALUES ('main', 0);

DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['branches','issue_reasons','b2b_clients','regular_clients','vouchers','app_users','voucher_requests','worker_links','app_settings'] LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY "Signed-in read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
  EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
END LOOP;
FOREACH t IN ARRAY ARRAY['branches','issue_reasons','b2b_clients','regular_clients','app_users','app_settings'] LOOP
  EXECUTE format('CREATE POLICY "Admin write" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
END LOOP;
FOREACH t IN ARRAY ARRAY['vouchers','voucher_requests','worker_links'] LOOP
  EXECUTE format('CREATE POLICY "Signed-in write" ON public.%I FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)', t);
END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;