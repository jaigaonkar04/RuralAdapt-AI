import { supabase } from './supabaseClient.js';

console.log('Supabase test started');

const { data, error } = await supabase
  .from('farmer_cases')
  .select('id')
  .limit(1);

if (error) {
  console.error('Supabase test failed:', error.message);
  process.exitCode = 1;
} else {
  console.log('Supabase connection successful.');
}