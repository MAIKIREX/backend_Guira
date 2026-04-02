require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabaseUrl or supabaseKey in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
  const email = 'admin@guira.com';
  const password = 'AdminPassword123!';

  console.log(`Creating user ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: 'Super Admin Guira'
    }
  });

  if (authError) {
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        console.log("User already exists. Attempting to get user id to assign admin status...");
        const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
        const user = usersData?.users?.find(u => u.email === email);
        if (user) {
            await updateProfileToAdmin(user.id);
        } else {
            console.error("Could not find existing user in users list.");
        }
    } else {
        console.error("Error creating user:", authError);
    }
    return;
  }
  
  if (authData.user) {
    console.log(`User created with ID: ${authData.user.id}`);
    
    // Give it a second for the Supabase DB trigger to create the profile row
    setTimeout(async () => {
        await updateProfileToAdmin(authData.user.id);
    }, 2000);
  }
}

async function updateProfileToAdmin(userId) {
    console.log(`Updating profile for ${userId} to super_admin...`);
    const { data: profileData, error: profileError } = await supabase.from('profiles')
      .update({ 
        role: 'super_admin',
        full_name: 'Super Admin Guira',
        email: 'admin@guira.com',
        onboarding_status: 'approved'
      })
      .eq('id', userId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
    } else {
      console.log("Successfully set user role to super_admin and populated profile fields. You can now login!");
      console.log("Email: admin@guira.com");
      console.log("Password: AdminPassword123!");
    }
}

createAdmin();
