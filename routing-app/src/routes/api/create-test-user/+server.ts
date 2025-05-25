import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import * as argon2 from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function POST() {
    try {
        // Check if test user already exists
        const existingUser = await db.query.user.findFirst({
            where: eq(user.username, 'testuser')
        });
        
        if (existingUser) {
            return json({ 
                success: true, 
                message: 'Test user already exists', 
                user: { 
                    id: existingUser.id, 
                    username: existingUser.username 
                } 
            });
        }
        
        // Create password hash
        const passwordHash = await argon2.hash('password123');
        
        // Insert test user
        const [newUser] = await db.insert(user).values({
            id: randomUUID(),
            username: 'testuser',
            passwordHash,
            age: 30
        }).returning();
        
        return json({ 
            success: true, 
            message: 'Test user created successfully', 
            user: { 
                id: newUser.id, 
                username: newUser.username 
            } 
        });
    } catch (error) {
        console.error('Error creating test user:', error);
        return json({ 
            success: false, 
            message: 'Failed to create test user',
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
} 