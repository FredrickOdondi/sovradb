# SovraDB B2B Client Connection Guide

This document outlines how B2B clients (e.g., Fina, Acme Corp) connect to their isolated namespaces within the SovraDB cluster using standard PostgreSQL tools, drivers, and automation platforms like n8n.

## 1. The Pooled Connection Architecture
SovraDB uses an advanced **Connection Pooling and Row-Level Security (RLS)** architecture. Instead of creating thousands of individual PostgreSQL database users (which would crash the database under heavy connection loads), SovraDB uses a single restricted system role.

Clients **do not** connect with their own dedicated username and password. Instead, all API and B2B client connections use the shared developer role, and the database dynamically routes them to their isolated data based on their session variables.

### Connection Credentials
When configuring your backend (Node.js, Python, n8n, etc.), use these exact PostgreSQL credentials to connect to the SovraDB edge node:

- **Host:** `127.0.0.1` *(or `host.docker.internal` if running inside a Docker container like n8n)*
- **Port:** `5432`
- **Database:** `sovra_db`
- **User:** `developer_branch_role`
- **Password:** `DevTesting123!`

---

## 2. Unlocking the Client Namespace
Because you are connecting via the global `developer_branch_role`, the database's Row-Level Security will physically block you from seeing **any data** by default. 

To access your custom tables, you must declare two session variables immediately after establishing your connection:

1. **The Search Path:** Tells PostgreSQL which schema (namespace) to look in by default.
2. **The Tenant ID:** Unlocks your specific rows in the global tables.

### SQL Query Execution Flow
In your backend application or automation tool, wrap your standard SQL queries with these `SET` commands:

```sql
-- 1. Set the search path to your dedicated namespace AND the public schema.
-- IMPORTANT: If your company name has capital letters (e.g., "Fina"), 
-- you MUST wrap it in double quotes!
SET search_path TO "Fina", public;

-- 2. Declare your cryptographic Tenant ID (UUID)
-- This unlocks Row-Level Security (RLS) for global tables.
SET app.current_tenant = 'a1072ac2-ddfe-40e2-a669-02e489e3445d';

-- 3. Execute your queries safely!
SELECT * FROM authors;  -- Queries the custom "authors" table inside the "Fina" schema
SELECT * FROM sovereign_users; -- Queries your isolated rows in the global table
```

---

## 3. Example: Connecting via n8n
If you are building workflows in n8n (running in Docker Desktop alongside SovraDB), follow these steps:

1. Add a **PostgreSQL Node** to your canvas.
2. Create new credentials using the parameters listed above (ensuring the Host is set to `host.docker.internal`).
3. Set the node Operation to **Execute Query**.
4. In the Query text box, stack the configuration commands directly above your actual query:

```sql
SET search_path TO "Fina", public;
SET app.current_tenant = '<YOUR_TENANT_UUID>';

SELECT * FROM my_custom_table;
```

---

## 4. Creating Tables & Inserting Data
Because your backend application or automation node is authentically connected to your isolated namespace, you can run standard DDL (Data Definition Language) and DML (Data Manipulation Language) commands directly. 

As long as the `search_path` is set to your namespace, any new tables you create or data you insert will automatically be locked exclusively inside your schema.

### Example in n8n (Postgres Node)
If you want to create a brand new table and immediately populate it with data from a previous n8n node, use this SQL block:

```sql
-- 1. Ensure you are targeting your specific namespace
SET search_path TO "Fina", public;

-- 2. Create the table natively
CREATE TABLE IF NOT EXISTS automated_invoices (
  id serial PRIMARY KEY,
  client_email text,
  amount decimal,
  created_at timestamptz DEFAULT now()
);

-- 3. Insert data into it!
INSERT INTO automated_invoices (client_email, amount)
VALUES ('ceo@acme.com', 4500.00);
```

---

## 5. Notes on Custom vs. Global Tables
- **Custom Tables:** When a B2B client creates a table (e.g., `authors`, `automated_invoices`), it is created exclusively inside their dedicated PostgreSQL Schema (e.g., `"Fina"`). No other client can query this schema.
- **Global Tables:** Core system tables like `sovereign_users` live in the `public` schema. They are shared across all clients, but you can only see rows where the `tenant_id` matches your active `app.current_tenant` session variable.
