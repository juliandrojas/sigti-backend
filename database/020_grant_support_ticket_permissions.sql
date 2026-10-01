BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON test.tickets TO service_role;
GRANT USAGE, SELECT ON SEQUENCE test.tickets_id_seq TO service_role;

COMMIT;
