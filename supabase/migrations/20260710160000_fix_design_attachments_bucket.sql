-- Anexos de tarefa usam o bucket design-attachments. As policies desse
-- bucket (e do event-avatars) dependiam de has_role(...::app_role), que só
-- passou a existir na migration anterior. Recriamos aqui pra garantir que
-- o bucket existe e que as policies usam a versão que já funciona.

INSERT INTO storage.buckets (id, name, public)
VALUES ('design-attachments', 'design-attachments', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-avatars', 'event-avatars', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['design-attachments', 'event-avatars'] LOOP
    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can upload in %1$s" ON storage.objects;
      CREATE POLICY "Partners can upload in %1$s"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = %2$L AND (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin')));
    $P$, b, b);

    EXECUTE format($P$
      DROP POLICY IF EXISTS "Anyone can view in %1$s" ON storage.objects;
      CREATE POLICY "Anyone can view in %1$s"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = %2$L);
    $P$, b, b);

    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can update in %1$s" ON storage.objects;
      CREATE POLICY "Partners can update in %1$s"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = %2$L AND (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin')));
    $P$, b, b);

    EXECUTE format($P$
      DROP POLICY IF EXISTS "Partners can delete in %1$s" ON storage.objects;
      CREATE POLICY "Partners can delete in %1$s"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = %2$L AND (public.has_role(auth.uid(), 'partner') OR public.has_role(auth.uid(), 'admin')));
    $P$, b, b);
  END LOOP;
END $$;
