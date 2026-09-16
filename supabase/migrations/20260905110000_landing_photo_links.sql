-- Álbuns públicos da área "Fotos da noite" da Landing Page Lagun.
CREATE TABLE IF NOT EXISTS public.landing_photo_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  event_date date,
  url text NOT NULL,
  cover_url text,
  is_visible boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landing_photo_links_visible_order_idx
  ON public.landing_photo_links (is_visible, display_order, event_date DESC);

ALTER TABLE public.landing_photo_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read visible landing photo links"
  ON public.landing_photo_links FOR SELECT TO anon
  USING (is_visible = true);

CREATE POLICY "Authenticated manage landing photo links"
  ON public.landing_photo_links FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
