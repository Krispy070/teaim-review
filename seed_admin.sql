-- Seed Admin User and Organization
-- Run this after bootstrap.sql and update the email to match your Supabase auth user

-- First, insert your user profile (replace with your actual auth.users ID and email)
-- You can get your auth.users ID from the Supabase Auth dashboard after signing up
INSERT INTO profiles (id, email, full_name)
VALUES (
    '00000000-0000-0000-0000-000000000000', -- Replace with your actual auth.users ID
    'admin@company.com', -- Replace with your actual email
    'System Administrator'
) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name;

-- Create a sample organization
INSERT INTO orgs (id, name, slug)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'ACME Corporation',
    'acme-corp'
) ON CONFLICT (slug) DO NOTHING;

-- Add the user as owner of the organization
INSERT INTO org_members (org_id, user_id, role)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000', -- Replace with your actual auth.users ID
    'owner'
) ON CONFLICT (org_id, user_id) DO UPDATE SET
    role = EXCLUDED.role;

-- Create a sample project
INSERT INTO projects (id, org_id, code, name, client_name, status, start_date, end_date)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'WD-ACME-2024',
    'ACME Workday Implementation',
    'ACME Corporation',
    'config',
    '2024-01-01',
    '2024-06-30'
) ON CONFLICT (code) DO NOTHING;

-- Create additional sample projects
INSERT INTO projects (id, org_id, code, name, client_name, status, start_date, end_date)
VALUES 
    (
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        'WD-GLOBEX-2024',
        'Globex Workday Implementation',
        'Globex Corporation',
        'design',
        '2024-02-01',
        '2024-08-31'
    ),
    (
        '44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111',
        'WD-STARK-2024',
        'Stark Industries Workday Implementation',
        'Stark Industries',
        'discovery',
        '2024-03-01',
        '2024-09-30'
    )
ON CONFLICT (code) DO NOTHING;

-- Insert sample action items for demonstration
INSERT INTO actions (org_id, project_id, title, description, owner, verb, due_date, status)
VALUES 
    (
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'Security review for ADP integration',
        'Complete security assessment for ADP payroll integration',
        'David Kim',
        'review',
        NOW() - INTERVAL '2 days',
        'overdue'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'Benefits enrollment testing',
        'Test the benefits enrollment workflow in sandbox environment',
        'Jennifer Adams',
        'test',
        NOW() + INTERVAL '1 day',
        'pending'
    ),
    (
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'Training materials review',
        'Review and approve training materials for end users',
        'Sarah Chen',
        'review',
        NOW() + INTERVAL '3 days',
        'pending'
    );

-- Insert sample wellness data for the current week
INSERT INTO mem_stats (org_id, project_id, week_label, very_negative, negative, neutral, positive, very_positive, total_responses, avg_score)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    TO_CHAR(NOW(), 'YYYY-"W"WW'),
    1,
    2,
    3,
    6,
    3,
    15,
    4
);

-- Create an audit log entry
INSERT INTO audit_log (org_id, project_id, user_id, action, details)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '00000000-0000-0000-0000-000000000000', -- Replace with your actual auth.users ID
    'admin_setup',
    '{"message": "Initial admin setup completed", "projects_created": 3, "actions_created": 3}'
);

-- Instructions for updating this file:
-- 1. Sign up for your Supabase project using your email
-- 2. Go to Authentication > Users in Supabase dashboard
-- 3. Copy your user ID from the auth.users table
-- 4. Replace all instances of '00000000-0000-0000-0000-000000000000' with your actual user ID
-- 5. Replace 'admin@company.com' with your actual email address
-- 6. Run this SQL script in the Supabase SQL Editor

-- Verification queries (run these to check if everything was set up correctly):
-- SELECT * FROM profiles WHERE email = 'admin@company.com';
-- SELECT * FROM orgs WHERE slug = 'acme-corp';
-- SELECT * FROM org_members WHERE role = 'owner';
-- SELECT * FROM projects WHERE org_id = '11111111-1111-1111-1111-111111111111';
