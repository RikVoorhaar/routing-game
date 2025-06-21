#!/usr/bin/env bun

// Generate a secure random string for AUTH_SECRET
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

console.log('\nGenerated AUTH_SECRET:');
console.log('=====================');
console.log(secret);
console.log('=====================\n');
console.log('Add this to your .env file:');
console.log(`AUTH_SECRET="${secret}"`);
console.log('\n');
