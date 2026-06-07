import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { getActiveNamespace } from '@/app/actions';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    // Determine which tenant the user is currently simulating in the dashboard
    const tenantName = await getActiveNamespace();
    
    // In a real app, this would be an authenticated user.
    // For this dashboard, we generate a random user session bound to the active tenant
    const userId = uuidv4();
    
    // The secret used to sign the JWT. 
    // This MUST match the POWERSYNC_JWT_SECRET environment variable in the PowerSync docker-compose!
    const jwtSecretStr = process.env.POWERSYNC_JWT_SECRET || 'change_me_in_production';
    const secret = new TextEncoder().encode(jwtSecretStr);

    // Create the JWT payload
    // PowerSync requires a 'sub' claim (user_id).
    // We also inject 'tenant_id' so PowerSync's sync_rules.yml can scope the replication correctly.
    const token = await new SignJWT({
      sub: userId,
      tenant_id: tenantName,
      // Pass the region through as well if the sync rules depend on it
      region_code: 'US' 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m') // short-lived token for security
      .sign(secret);

    // PowerSync uses the POWERSYNC_URL natively, but we can override it in our connector
    return NextResponse.json({
      token,
      endpoint: 'http://localhost:8080'
    });
  } catch (error: any) {
    console.error('Error generating PowerSync token:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
