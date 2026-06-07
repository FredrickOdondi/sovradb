import postgres from 'postgres';

// Connection to the local Docker port mapping for the US partition node.
// We connect as the superuser (sovra_admin) to allow broad introspection,
// but we will use SET ROLE when executing specific masked queries.
const sql = postgres('postgres://sovra_admin:SuperSecretSCRAMPassword123!@127.0.0.1:5432/sovra_db', {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: false,
});

export default sql;
