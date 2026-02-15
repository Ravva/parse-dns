import { spawn } from 'node:child_process';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        // Only allow localhost or authorized users if needed. For now open.
        console.log('API: Triggering manual parse...');

        // Spawn the parser process detached so the request doesn't hang
        const child = spawn('bun', ['run', 'parse'], {
            stdio: 'ignore', // or 'inherit' to see logs in server console
            shell: true,
            detached: true
        });

        child.unref(); // Allow parent to exit independently if needed

        return NextResponse.json({ message: 'Parser started successfully' });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Failed to start parser' }, { status: 500 });
    }
}
