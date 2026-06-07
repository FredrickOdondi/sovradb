import { column, Schema, Table } from '@powersync/web';

// Define the local SQLite representation of the sovereign_users table
// PowerSync will automatically sync data from Postgres into this table based on sync_rules.yml
export const sovereignUsers = new Table({
  // The tenant_id and region_code are used for routing, but we want to be able to query them locally
  tenant_id: column.text,
  region_code: column.text,
  email: column.text,
  full_name: column.text,
  created_at: column.text,
  ssn: column.text,
  national_id_number: column.integer,
  // Blob columns aren't directly supported by standard PowerSync types yet, we can use text and decode if needed,
  // or omit if we don't need it on the edge (which we don't, it's nulled out by pg_anon anyway)
});

export const AppSchema = new Schema({
  sovereign_users: sovereignUsers
});

export type Database = (typeof AppSchema)['types'];
