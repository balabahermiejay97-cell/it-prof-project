import { createClient } from '@supabase/supabase-js';

// Your Supabase URL and Anon Public Key
const SUPABASE_URL = 'https://mjinuracctfumuyohwxl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qaW51cmFjY3RmdW11eW9od3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NDA3ODEsImV4cCI6MjA3OTIxNjc4MX0.LKwlYS4A_qhHEvxsNUlEReYOJFOEfb1IFhWq-u0G4KA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
