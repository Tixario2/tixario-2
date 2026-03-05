-- =============================================================
-- Migration : 20260305000005_owner_and_profiles.sql
-- Step 5    : profiles table, owner_id columns, RLS policies
-- =============================================================


-- -------------------------------------------------------------
-- 1. profiles table
-- -------------------------------------------------------------

CREATE TABLE profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, name) VALUES (NEW.id, NEW.raw_user_meta_data->>'name');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- -------------------------------------------------------------
-- 2. owner_id on billets (nullable — backfill manually)
-- -------------------------------------------------------------

ALTER TABLE billets
  ADD COLUMN owner_id uuid REFERENCES auth.users(id);


-- -------------------------------------------------------------
-- 3. owner_id on commandes (nullable — backfill manually)
-- -------------------------------------------------------------

ALTER TABLE commandes
  ADD COLUMN owner_id uuid REFERENCES auth.users(id);


-- -------------------------------------------------------------
-- 4. RLS on profiles
--    Authenticated users can SELECT / UPDATE their own row only.
-- -------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own
  ON profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update_own
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- -------------------------------------------------------------
-- 5. RLS on billets
--    Anon: public SELECT for browsing.
--    Authenticated: SELECT / UPDATE / DELETE own rows only.
-- -------------------------------------------------------------

CREATE POLICY billets_select_anon
  ON billets
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY billets_select_own
  ON billets
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY billets_update_own
  ON billets
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY billets_delete_own
  ON billets
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());


-- -------------------------------------------------------------
-- 6. RLS on commandes
--    Authenticated users can SELECT / UPDATE only their own rows.
--    INSERT remains service-role only (no authenticated policy).
-- -------------------------------------------------------------

ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;

CREATE POLICY commandes_select_own
  ON commandes
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY commandes_update_own
  ON commandes
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());


-- -------------------------------------------------------------
-- 7. public_billets view — exposes all billets columns except
--    owner_id, for safe public and authenticated browsing.
-- -------------------------------------------------------------

CREATE VIEW public_billets AS
  SELECT
    id_billet,
    evenement,
    categorie,
    prix,
    quantite,
    ticket_type,
    enforce_no_solo,
    date,
    ville,
    pays,
    logo_artiste,
    image,
    slug,
    session,
    disponible,
    map_png,
    map_svg,
    zone_id
  FROM billets;

GRANT SELECT ON public_billets TO anon, authenticated;
