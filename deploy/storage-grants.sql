-- Storage schema grants for the Supabase roles.
--
-- Why this file exists: storage-api's bundled migration 0002-storage-schema
-- creates anon/authenticated/service_role AND grants them access to the storage
-- schema in the same DO block, gated on storage.install_roles. We run with
-- DB_INSTALL_ROLES=false because the three roles already exist from stage B, so
-- the whole block is skipped -- including the grants. Without them storage-api
-- connects, does SET ROLE service_role, and then fails every query with
-- 'relation "buckets" does not exist' because service_role has no USAGE on the
-- schema. These statements are the grant half of that migration, replayed.
--
-- Idempotent: safe to re-run.

GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA storage TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO postgres, anon, authenticated, service_role;

-- Tables created by future storage-api migrations must be reachable too.
-- Defaults are per-granting-role, hence both owners.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

-- storage-api resolves unqualified table names ("buckets") after SET ROLE, so
-- the storage schema has to be on the search_path of every role it switches to.
ALTER ROLE anon SET search_path TO public, storage;
ALTER ROLE authenticated SET search_path TO public, storage;
ALTER ROLE service_role SET search_path TO public, storage;
