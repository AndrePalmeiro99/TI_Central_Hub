import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bavkzxkcchxtvurbabzi.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhdmt6eGtjY2h4dHZ1cmJhYnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODE1NjksImV4cCI6MjA5MDU1NzU2OX0.YrycwqyzLZPzqPChMHzge8Q-hx8AonQNkfsRlFn67iY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
