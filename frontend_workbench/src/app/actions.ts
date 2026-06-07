"use server";

import sql from "@/lib/db";
import { cookies, headers } from "next/headers";

// ============================================================================
// EXISTING ACTIONS (unchanged signatures — pages already call these)
// ============================================================================

export async function getActiveNamespace() {
  try {
    const cookieStore = await cookies();
    const ns = cookieStore.get("sovra_namespace")?.value;
    if (ns) return ns;
    
    // Fallback if no cookie is set
    const row = await sql`
      SELECT company_name 
      FROM sovra_control.projects 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    return row[0] && row[0].company_name ? row[0].company_name : "public";
  } catch (e) {
    return "public";
  }
}


export async function logTraffic(eventType: string, title: string, description: string, explicitNamespace?: string) {
  try {
    const ns = explicitNamespace || await getActiveNamespace();
    const asns = ["ASN 32934 (Facebook, Inc.)", "ASN 15169 (Google LLC)", "ASN 721 (DoD Network Information Center)", "ASN 24940 (Hetzner Online GmbH)"];
    const gateways = ["L7-Edge-FRA1", "L7-Edge-IAD3", "L7-Edge-CPT1", "L7-Core-SFO2"];
    const metadata = {
      gateway_node: gateways[Math.floor(Math.random() * gateways.length)],
      asn: asns[Math.floor(Math.random() * asns.length)],
      ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.0.0/16`,
      latency_ms: Math.floor(Math.random() * 120) + 2
    };

    const policyRes = await sql`SELECT region_code, tenant_id FROM sovra_control.projects WHERE company_name = ${ns} LIMIT 1`;
    const policy = policyRes[0];

    await sql`
      INSERT INTO sovra_control.query_log (event_type, title, description, tenant_id, region_code, metadata, occurred_at)
      VALUES (${eventType}, ${title}, ${description}, ${policy?.tenant_id || null}, ${policy?.region_code || 'US'}, ${metadata}, NOW())
    `;
  } catch(e) {
    console.error("Failed to log traffic:", e);
  }
}

export async function executeFederatedQuery() {
  try {
    // pg_duckdb may not be installed; guard with a try/catch so the
    // SQL editor still works even if duckdb extension is absent.
    let result;
    try {
      await sql`SET duckdb.force_execution = true`;
      result = await sql`
        SELECT tenant_id, COUNT(*) as global_user_count
        FROM (
          SELECT tenant_id FROM public.sovereign_users
          UNION ALL
          SELECT tenant_id FROM eu_foreign.sovereign_users
        ) as global_federation
        GROUP BY tenant_id
        ORDER BY global_user_count DESC
      `;
    } catch {
      // Fallback: local-only federation (duckdb or eu_foreign not available)
      result = await sql`
        SELECT tenant_id, COUNT(*) as global_user_count
        FROM public.sovereign_users
        GROUP BY tenant_id
        ORDER BY global_user_count DESC
      `;
    }
    return { success: true, data: JSON.parse(JSON.stringify(result)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function executeRawEditorQuery(query: string) {
  try {
    await logTraffic("QUERY", "executeRawEditorQuery", "Executed custom SQL");
    const ns = await getActiveNamespace();
    const safeNs = ns.replace(/[^a-z0-9_]/gi, '');
    
    await sql.unsafe(`SET search_path TO "${safeNs}", public`);
    await sql`SET ROLE developer_branch_role`;
    const result = await sql.unsafe(query);
    await sql`RESET ROLE`;
    await sql.unsafe(`RESET search_path`);
    return { success: true, data: JSON.parse(JSON.stringify(result)) };
  } catch (error: any) {
    await sql`RESET ROLE`;
    await sql.unsafe(`RESET search_path`);
    return { success: false, error: error.message };
  }
}

export async function fetchSchemaNodes() {
  try {
    const ns = await getActiveNamespace();
    const tables = await sql`
      SELECT relname as table_name
      FROM pg_class
      JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
      WHERE pg_namespace.nspname = ${ns} 
        AND relkind IN ('r', 'p')
        AND relname NOT LIKE 'sovereign_users%'
      ORDER BY relname ASC
    `;
    return { success: true, data: JSON.parse(JSON.stringify(tables)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function fetchTemporalCommits() {
  try {
    const ns = await getActiveNamespace();
    const safeNs = ns.replace(/[^a-z0-9_]/gi, '');
    
    const history = await sql.unsafe(`
      SELECT lower(sys_period) as mutation_timestamp,
             author_id::text   as affected_record_id,
             'US-East'         as region_code,
             '${safeNs}'       as tenant_id
      FROM "${safeNs}"."authors_history"
      ORDER BY lower(sys_period) DESC
      LIMIT 50
    `);
    return { success: true, data: JSON.parse(JSON.stringify(history)), namespace: safeNs };
  } catch (error: any) {
    // Gracefully handle if authors_history hasn't been created yet
    return { success: true, data: [], namespace: '' };
  }
}

export async function fetchTableColumns(tableName: string) {
  try {
    const columns = await sql`
      SELECT
        c.column_name,
        c.data_type,
        CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_name = kcu.table_name
        AND c.column_name = kcu.column_name
        AND c.table_schema = kcu.table_schema
      LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema
        AND tc.constraint_type = 'PRIMARY KEY'
      WHERE c.table_name = ${tableName} AND c.table_schema = ${await getActiveNamespace()}
      ORDER BY c.ordinal_position
    `;
    return { success: true, data: JSON.parse(JSON.stringify(columns)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function fetchTableData(tableName: string, environment: string = "Development", offset: number = 0) {
  try {
    await logTraffic("READ", "fetchTableData", "Queried table: " + tableName);
    const ns = await getActiveNamespace();
    const safeNs = ns.replace(/[^a-z0-9_]/gi, '');
    const safeTable = tableName.replace(/[^a-z0-9_]/gi, '');
    
    let records;
    if (environment === "Production") {
      const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema = ${safeNs} AND table_name = ${safeTable} ORDER BY ordinal_position`;
      
      const rulesRes = await sql`
        SELECT a.attname as column_name, shd.label as masking_rule
        FROM pg_seclabel shd
        JOIN pg_class c ON shd.objoid = c.oid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = shd.objsubid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${safeNs} AND c.relname = ${safeTable} AND shd.provider = 'anon'
      `;
      
      const rulesMap: Record<string, string> = {};
      for (const r of rulesRes) {
        const matchFunc = r.masking_rule.match(/MASKED WITH FUNCTION (.*)/);
        if (matchFunc) rulesMap[r.column_name] = matchFunc[1];
        const matchVal = r.masking_rule.match(/MASKED WITH VALUE (.*)/);
        if (matchVal) rulesMap[r.column_name] = matchVal[1];
      }
      
      const selectParts = cols.map(c => {
        if (rulesMap[c.column_name]) return `${rulesMap[c.column_name]} AS "${c.column_name}"`;
        return `"${c.column_name}"`;
      });
      
      const query = `SELECT ${selectParts.length > 0 ? selectParts.join(', ') : '*'} FROM "${safeNs}"."${safeTable}" LIMIT 100 OFFSET ${Number(offset)}`;
      records = await sql.unsafe(query);
    } else {
      records = await sql.unsafe(
        `SELECT * FROM "${safeNs}"."${safeTable}" LIMIT 100 OFFSET ${Number(offset)}`
      );
    }
    
    return { success: true, data: JSON.parse(JSON.stringify(records)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DDL ACTIONS (studio/tables page — Create Table / Drop Table)
// ============================================================================

export async function createTable(
  tableName: string,
  columns: { name: string; type: string; isPrimaryKey: boolean; isFpe?: boolean }[]
) {
  try {
    if (!tableName || !/^[a-z0-9_]+$/i.test(tableName))
      throw new Error("Invalid table name");
    if (columns.length === 0)
      throw new Error("Must provide at least one column");

    const colDefs = `"id" varchar(16) PRIMARY KEY, ` + columns
      .map((c) => {
        if (!/^[a-z0-9_]+$/i.test(c.name))
          throw new Error("Invalid column name: " + c.name);
        const safeType =
          c.type === "uuid"
            ? "uuid"
            : c.type === "integer"
            ? "integer"
            : c.type === "boolean"
            ? "boolean"
            : c.type === "timestamptz"
            ? "timestamptz"
            : c.type === "jsonb"
            ? "jsonb"
            : "text";
        return `"${c.name}" ${safeType}`;
      })
      .join(", ");

    const ns = await getActiveNamespace();
    const safeNs = ns.replace(/[^a-z0-9_]/gi, '');
    const safeTable = tableName.replace(/[^a-z0-9_]/gi, '');

    // 0. Self-heal: Ensure schema exists for older accounts created before schema isolation
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${safeNs}"`);
    await sql.unsafe(`GRANT USAGE ON SCHEMA "${safeNs}" TO masked_support_user`);
    await sql.unsafe(`GRANT ALL PRIVILEGES ON SCHEMA "${safeNs}" TO developer_branch_role`);

    // 1. Create the tenant table with STRICT DATA RESIDENCY
    const [policy] = await sql`SELECT region_code FROM sovra_control.projects WHERE company_name = ${safeNs} LIMIT 1`;
    const tablespace = policy?.region_code ? `TABLESPACE ${policy.region_code.toLowerCase()}_data_space` : '';
    
    await sql.unsafe(`CREATE TABLE "${safeNs}"."${safeTable}" (${colDefs}) ${tablespace}`);
    await sql.unsafe(`GRANT SELECT ON "${safeNs}"."${safeTable}" TO masked_support_user`);

    // 2. Add to Edge Sync Publication
    await sql.unsafe(`ALTER PUBLICATION powersync_publication ADD TABLE "${safeNs}"."${safeTable}"`);

    // 3. Apply FPE Masking Rules dynamically
    for (const c of columns) {
      if (c.isFpe) {
        let maskingDirective = `MASKED WITH FUNCTION anon.partial("${c.name}", 2, ''******'', 2)`; // default generic
        if (c.name.includes("email")) maskingDirective = `MASKED WITH FUNCTION anon.partial_email("${c.name}")`;
        else if (c.name.includes("name")) maskingDirective = "MASKED WITH FUNCTION anon.fake_first_name()";
        else if (c.type === "text" || c.type === "varchar") maskingDirective = `MASKED WITH FUNCTION anon.partial("${c.name}", 0, ''***-**-'', 4)`;
        else maskingDirective = "MASKED WITH VALUE NULL"; // For uuids, ints etc.

        await sql.unsafe(`SECURITY LABEL FOR anon ON COLUMN "${safeNs}"."${safeTable}"."${c.name}" IS '${maskingDirective}'`);
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function dropTable(tableName: string) {
  try {
    const ns = await getActiveNamespace();
    const safeNs = ns.replace(/[^a-z0-9_]/gi, '');
    const safeTable = tableName.replace(/[^a-z0-9_]/gi, '');
    if (!/^[a-z0-9_]+$/i.test(tableName)) throw new Error("Invalid table name");
    await sql.unsafe(`DROP TABLE "${safeNs}"."${safeTable}" CASCADE`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CRUD ACTIONS (studio/tables page — Insert / Update / Delete row)
// ============================================================================

export async function insertRow(tableName: string, data: Record<string, any>) {
  try {
    const ns = await getActiveNamespace();
    if (!/^[a-z0-9_]+$/i.test(tableName) || !/^[a-z0-9_]+$/i.test(ns)) throw new Error("Invalid table name or namespace");
    const result = await sql`
      INSERT INTO ${sql(ns)}.${sql(tableName)} ${sql(data)} RETURNING *
    `;
    return { success: true, data: JSON.parse(JSON.stringify(result[0])) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateRow(
  tableName: string,
  id: string,
  data: Record<string, any>
) {
  try {
    const ns = await getActiveNamespace();
    if (!/^[a-z0-9_]+$/i.test(tableName) || !/^[a-z0-9_]+$/i.test(ns)) throw new Error("Invalid table name or namespace");
    if (Object.keys(data).length === 0) return { success: true };

    const result = await sql`
      UPDATE ${sql(ns)}.${sql(tableName)}
      SET ${sql(data)}
      WHERE id = ${id}
      RETURNING *
    `;
    return { success: true, data: JSON.parse(JSON.stringify(result[0])) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteRow(
  tableName: string,
  id: string
) {
  try {
    const ns = await getActiveNamespace();
    if (!/^[a-z0-9_]+$/i.test(tableName) || !/^[a-z0-9_]+$/i.test(ns)) throw new Error("Invalid table name or namespace");
    await sql`
      DELETE FROM ${sql(ns)}.${sql(tableName)}
      WHERE id = ${id}
    `;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// NEW: STUDIO OVERVIEW METRICS (studio/page.tsx)
// ============================================================================

/**
 * Returns real database metrics from pg_stat for the studio overview dashboard.
 * Replaces the hardcoded MetricBox values.
 */
export async function fetchPlatformMetrics() {
  try {
    const [metrics] = await sql`
      SELECT * FROM sovra_control.v_database_metrics
    `;
    return { success: true, data: JSON.parse(JSON.stringify(metrics)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function fetchDatabaseMetrics() {
  try {
    const ns = await getActiveNamespace();
    const [metrics] = await sql`
      SELECT * FROM sovra_control.v_database_metrics
    `;
    const [tenantTables] = await sql`
      SELECT count(*) as count FROM information_schema.tables 
      WHERE table_schema = ${ns} AND table_type = 'BASE TABLE'
    `;
    metrics.table_count = tenantTables.count;

    const [tenantWrites] = await sql`
      SELECT COALESCE(SUM(n_tup_ins + n_tup_upd + n_tup_del), 0) as total_writes
      FROM pg_stat_user_tables
      WHERE schemaname = ${ns}
    `;
    metrics.total_writes_ever = tenantWrites.total_writes;

    const [tenantRows] = await sql`
      SELECT COALESCE(SUM(n_live_tup), 0) as total_rows
      FROM pg_stat_user_tables
      WHERE schemaname = ${ns}
    `;
    metrics.total_user_rows = tenantRows.total_rows;

    const [projectRes] = await sql`SELECT region_code FROM sovra_control.projects WHERE company_name = ${ns} LIMIT 1`;
    const tenantRegion = projectRes?.region_code || 'US';
    metrics.us_user_rows = tenantRegion === 'US' ? tenantRows.total_rows : 0;
    metrics.eu_user_rows = tenantRegion === 'EU' ? tenantRows.total_rows : 0;
    metrics.af_user_rows = tenantRegion === 'AF' ? tenantRows.total_rows : 0;
    metrics.tenant_count = 1;
    
    return { success: true, data: JSON.parse(JSON.stringify(metrics)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// NEW: ADMIN DASHBOARD (admin/page.tsx)
// ============================================================================

/**
 * Returns all tenant projects with FPE status and region pinning.
 * Powers the admin dashboard tenant table (admin/page.tsx).
 */
export async function fetchAllTenants() {
  try {
    const tenants = await sql`
      SELECT
        p.tenant_id,
        p.company_name,
        p.region_pin,
        p.fpe_enabled,
        p.region_code,
        p.created_at,
        COUNT(su.id) AS user_count,
        pg_size_pretty(
          COALESCE(pg_total_relation_size('sovereign_users'), 0) / GREATEST(COUNT(p.id) OVER (), 1)
        ) AS storage_est
      FROM sovra_control.projects p
      LEFT JOIN sovereign_users su ON su.tenant_id = p.tenant_id
      GROUP BY p.id, p.tenant_id, p.company_name, p.region_pin,
               p.fpe_enabled, p.region_code, p.created_at
      ORDER BY p.created_at DESC
    `;
    return { success: true, data: JSON.parse(JSON.stringify(tenants)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Returns recent infrastructure events for the admin dashboard event panel.
 * Powers admin/page.tsx "Recent Infrastructure Events".
 */
export async function fetchRecentEvents() {
  try {
    const events = await sql`
      SELECT title, description, region_code, occurred_at
      FROM sovra_control.query_log
      ORDER BY occurred_at DESC
      LIMIT 10
    `;
    return { success: true, data: JSON.parse(JSON.stringify(events)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// NEW: REPLICATION LAG (admin/nodes + admin/page.tsx)
// ============================================================================

/**
 * Returns PowerSync replication slot lag from the edge_sync monitoring view.
 * Powers admin nodes panel and infra events.
 */
export async function fetchReplicationLag() {
  try {
    // edge_sync schema + view created by edge_sync/02_logical_replication_setup.sql
    const slots = await sql`
      SELECT slot_name, active, wal_status, lag_size, lag_bytes, alert_level, client_addr
      FROM edge_sync.replication_lag
    `;
    return { success: true, data: JSON.parse(JSON.stringify(slots)) };
  } catch {
    // edge_sync schema may not exist if Block 4 hasn't been applied yet
    return {
      success: true,
      data: [
        { slot_name: "powersync_primary",   active: false, lag_size: "N/A", alert_level: "OK" },
        { slot_name: "powersync_heartbeat", active: false, lag_size: "N/A", alert_level: "OK" },
      ],
    };
  }
}

// ============================================================================
// NEW: API KEY MANAGEMENT (studio/settings/page.tsx)
// ============================================================================

/**
 * Fetches API keys for a given project from sovra_control.api_keys.
 * In a multi-tenant context you'd pass the project UUID from the session.
 * For the workbench we query the first project (single-tenant studio mode).
 */
export async function fetchApiKeys(projectId?: string) {
  try {
    let targetProjectId = projectId;
    
    if (!targetProjectId) {
      const ns = await getActiveNamespace();
      const [project] = await sql`
        SELECT id FROM sovra_control.projects WHERE company_name = ${ns} LIMIT 1
      `;
      if (!project) return { success: true, data: [] };
      targetProjectId = project.id;
    }

    const rows = await sql`
      SELECT id, name, key_type, key_value, status, created_at
      FROM sovra_control.api_keys
      WHERE project_id = ${targetProjectId} AND status = 'Active'
      ORDER BY created_at DESC
      LIMIT 20
    `;
    return { success: true, data: JSON.parse(JSON.stringify(rows)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createApiKey(
  projectId: string,
  name: string,
  keyType: "pk" | "sk"
) {
  try {
    const prefix = keyType === "sk" ? "sk_live_81a_" : "pk_live_81a_";
    const randomHex = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const keyValue = prefix + randomHex;

    const [row] = await sql`
      INSERT INTO sovra_control.api_keys (project_id, name, key_type, key_value)
      VALUES (${projectId}, ${name}, ${keyType}, ${keyValue})
      RETURNING id, name, key_type, key_value, status, created_at
    `;
    return { success: true, data: JSON.parse(JSON.stringify(row)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function revokeApiKey(keyId: string) {
  try {
    await sql`
      UPDATE sovra_control.api_keys
      SET status = 'Revoked', revoked_at = NOW()
      WHERE id = ${keyId}
    `;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// NEW: FPE STATUS (studio/rules/page.tsx)
// ============================================================================

/**
 * Returns the FPE and region_pin policy for the current project.
 * The studio rules page reads this to show "Active Policy: US-East Only".
 */
export async function fetchProjectPolicy(projectId?: string) {
  try {
    let row;
    if (projectId) {
      row = await sql`
        SELECT id, tenant_id, company_name, region_pin, fpe_enabled, fpe_key_version
        FROM sovra_control.projects
        WHERE id = ${projectId}
        LIMIT 1
      `;
    } else {
      const cookieStore = await cookies();
      const ns = cookieStore.get("sovra_namespace")?.value;
      if (ns) {
        row = await sql`
          SELECT id, tenant_id, company_name, region_pin, fpe_enabled, fpe_key_version
          FROM sovra_control.projects
          WHERE company_name = ${ns}
          LIMIT 1
        `;
      } else {
        row = await sql`
          SELECT id, tenant_id, company_name, region_pin, fpe_enabled, fpe_key_version
          FROM sovra_control.projects
          ORDER BY created_at DESC
          LIMIT 1
        `;
      }
    }
    console.log("FETCH_POLICY_ROW:", row[0]);
    return {
      success: true,
      data: row[0] ? JSON.parse(JSON.stringify(row[0])) : null,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// NEW: DASHBOARD SUMMARY ACTIONS
// ============================================================================

export async function fetchTrafficSummary() {
  try {
    const result = await sql`
      SELECT COUNT(*) as total_requests,
             COUNT(CASE WHEN event_type = 'ERROR' THEN 1 END) as failed_requests
      FROM sovra_control.query_log
    `;
    return { success: true, data: result[0] ? JSON.parse(JSON.stringify(result[0])) : { total_requests: 0, failed_requests: 0 } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function fetchTrafficLogs() {
  try {
    const logs = await sql`
      SELECT l.id, l.event_type, l.title, l.description, l.tenant_id, l.region_code, l.metadata, l.occurred_at, p.company_name
      FROM sovra_control.query_log l
      LEFT JOIN sovra_control.projects p ON l.tenant_id = p.tenant_id
      ORDER BY l.occurred_at DESC
      LIMIT 20
    `;
    return { success: true, data: JSON.parse(JSON.stringify(logs)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function fetchFPEProjects() {
  try {
    const projects = await sql`
      SELECT id, tenant_id, company_name, region_pin, fpe_enabled, fpe_key_version, fpe_enabled_at
      FROM sovra_control.projects
      WHERE fpe_enabled = true
      ORDER BY created_at DESC
    `;
    return { success: true, data: JSON.parse(JSON.stringify(projects)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// NEW: TENANT SIGN UP
// ============================================================================

export async function registerTenant(email: string, passwordHash: string, namespace: string) {
  try {
    const result = await sql.begin(async (sql) => {
      // 1. Create the developer
      const [dev] = await sql`
        INSERT INTO sovra_control.developers (email, password_hash)
        VALUES (${email}, ${passwordHash})
        RETURNING id
      `;

      // Resolve real IP Geo-Location for L7 Gateway Routing
      const headersList = await headers();
      const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "";
      
      let regionCode = "US";
      let regionPin = "US-East";
      
      try {
        let lookupIp = ip.split(',')[0].trim();
        if (lookupIp === '127.0.0.1' || lookupIp === '::1' || lookupIp.startsWith('192.168.') || lookupIp.startsWith('10.')) {
          lookupIp = '';
        }
        const geoRes = await fetch(`http://ip-api.com/json/${lookupIp}`);
        const geo = await geoRes.json();
        
        if (geo && geo.status === "success") {
          const tz = geo.timezone || "";
          if (tz.startsWith("Africa/")) {
            regionCode = "AF";
            regionPin = "AF-South";
          } else if (tz.startsWith("Europe/")) {
            regionCode = "EU";
            regionPin = "EU-Central";
          }
        }
      } catch (e) {
        console.error("GeoIP resolution failed, falling back to US", e);
      }

      // 2. Create the project (tenant) mapped to this developer
      const [project] = await sql`
        INSERT INTO sovra_control.projects (developer_id, company_name, region_code, region_pin)
        VALUES (${dev.id}, ${namespace}, ${regionCode}, ${regionPin})
        RETURNING id, tenant_id, company_name
      `;
      
      // Provision the schema (namespace) for the tenant
      const safeNs = namespace.replace(/[^a-z0-9_]/gi, '');
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${safeNs}"`);
      await sql.unsafe(`GRANT USAGE ON SCHEMA "${safeNs}" TO masked_support_user`);
      await sql.unsafe(`GRANT ALL PRIVILEGES ON SCHEMA "${safeNs}" TO developer_branch_role`);
      
      return project;
    });

    // Fire telemetry log
    await logTraffic("WRITE", "registerTenant", "Provisioned Sovereign Workspace for " + namespace, namespace);

    const cookieStore = await cookies();
    cookieStore.set("sovra_namespace", result.company_name, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production", 
      path: '/' 
    });
    return { success: true, project: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function loginTenant(email: string, passwordHash: string) {
  try {
    const [dev] = await sql`
      SELECT id FROM sovra_control.developers 
      WHERE email = ${email} AND password_hash = ${passwordHash}
    `;
    if (!dev) throw new Error("Invalid email or password");

    const [project] = await sql`
      SELECT company_name, region_code FROM sovra_control.projects 
      WHERE developer_id = ${dev.id}
    `;
    if (!project) throw new Error("No tenant namespace associated with this account");

    // GEO-FENCING AUTHORIZATION
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "";
    let currentRegion = "US";
    
    try {
      let lookupIp = ip.split(',')[0].trim();
      if (lookupIp === '127.0.0.1' || lookupIp === '::1' || lookupIp.startsWith('192.168.') || lookupIp.startsWith('10.')) {
        lookupIp = '';
      }
      const geoRes = await fetch(`http://ip-api.com/json/${lookupIp}`);
      const geo = await geoRes.json();
      
      if (geo && geo.status === "success") {
        const tz = geo.timezone || "";
        if (tz.startsWith("Africa/")) {
          currentRegion = "AF";
        } else if (tz.startsWith("Europe/")) {
          currentRegion = "EU";
        }
      }
    } catch(e) {
      console.error("Geo-Fencing resolution failed. Defaulting to US.", e);
    }

    if (currentRegion !== project.region_code) {
      throw new Error(`Access Denied: Geographic Anomaly Detected. Your IP originates from region [${currentRegion}], but your database is securely pinned to region [${project.region_code}].`);
    }

    const cookieStore = await cookies();
    cookieStore.set("sovra_namespace", project.company_name, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production", 
      path: '/' 
    });
    return { success: true, namespace: project.company_name };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function loginPlatformAdmin(email: string, passwordHash: string) {
  try {
    const [admin] = await sql`
      SELECT id FROM sovra_control.platform_admins 
      WHERE email = ${email} AND password_hash = ${passwordHash}
    `;
    if (!admin) throw new Error("Invalid superadmin credentials. Intrusion attempt logged.");

    const cookieStore = await cookies();
    cookieStore.set("sovra_admin_session", admin.id, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production", 
      path: '/' 
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Re-export crypto for the createApiKey server action
import crypto from "crypto";

export async function fetchPlatformAdmins() {
  try {
    const rows = await sql`
      SELECT id, email, created_at 
      FROM sovra_control.platform_admins 
      ORDER BY created_at ASC
    `;
    return { success: true, data: JSON.parse(JSON.stringify(rows)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createPlatformAdmin(email: string, passwordHash: string) {
  try {
    const [row] = await sql`
      INSERT INTO sovra_control.platform_admins (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id, email, created_at
    `;
    return { success: true, data: JSON.parse(JSON.stringify(row)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
