-- Mantém os módulos disponíveis no código, mas ocultos do sidebar interno.
UPDATE public.sidebar_menu_settings
SET enabled = false,
    updated_at = now()
WHERE key IN ('prive', 'zig_tickets', 'blueticket');
