import { AbstractPowerSyncDatabase, PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './AppSchema';

// We create a singleton instance of the PowerSync database.
let powerSyncInstance: AbstractPowerSyncDatabase | null = null;

// The connector establishes the WebSocket connection to the backend
class BackendConnector {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async fetchCredentials() {
    // Call our Next.js API route to generate a JWT for the active tenant
    const response = await fetch('/api/powersync/token');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PowerSync token: ${response.status}`);
    }

    const { token, endpoint } = await response.json();

    return {
      endpoint: endpoint || this.endpoint,
      token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // valid for 5 min
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    // PowerSync relies on standard HTTP endpoints for client-to-server writes (mutations).
    // In a real implementation, you would read from database.getNextCrudTransaction()
    // and PUT/POST to a Next.js API route that writes to Postgres.
    // For this demonstration of "Edge Sync Catalyst", we focus on the downstream 
    // reactive sync (Postgres -> Gateway -> PowerSync -> Client).
    
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    
    console.log("Mock upload: client mutating data", transaction);
    
    // Simulating success
    await database.completeCrudTransaction(transaction);
  }
}

export const setupPowerSync = async (): Promise<AbstractPowerSyncDatabase> => {
  if (powerSyncInstance) {
    return powerSyncInstance;
  }

  // Ensure WASM is loaded properly in the browser environment
  if (typeof window === 'undefined') {
    throw new Error('PowerSync must be initialized in a browser environment');
  }

  const { WASQLiteVFS, WASQLiteOpenOptions } = await import('@journeyapps/wa-sqlite');
  const { WASQLitePowerSyncDatabaseOpenFactory } = await import('@powersync/web');

  const factory = new WASQLitePowerSyncDatabaseOpenFactory({
    dbFilename: 'sovradb-local-cache.sqlite',
    schema: AppSchema,
    flags: {
      enableMultiTabs: true
    }
  });

  const db = factory.getInstance();
  powerSyncInstance = db;

  // Wait for the local database to be ready
  await db.init();

  // Initialize the backend connector
  // The PowerSync docker-compose service exposes port 8080 locally
  const connector = new BackendConnector('http://localhost:8080');

  // Connect! This opens the WebSocket stream.
  db.connect(connector);

  return db;
};
