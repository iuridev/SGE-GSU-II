-- Páginas favoritas do usuário no menu lateral (App.tsx). Antes ficava só no
-- localStorage por user.id, o que não sincronizava entre dispositivos
-- diferentes logados na mesma conta. Agora é a fonte de verdade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'favorite_pages'
  ) THEN
    ALTER TABLE profiles ADD COLUMN favorite_pages jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN profiles.favorite_pages IS 'Lista (jsonb array de strings) dos ids de página marcados como favoritos pelo usuário no menu lateral.';

-- Função dedicada (security definer) em vez de depender de uma policy de UPDATE
-- genérica em profiles: escopo restrito a essa única coluna, sempre limitado
-- à própria linha do usuário autenticado.
CREATE OR REPLACE FUNCTION public.set_my_favorite_pages(pages jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET favorite_pages = pages WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_favorite_pages(jsonb) TO authenticated;
