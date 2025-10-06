-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Create organizations table
CREATE TABLE IF NOT EXISTS orgs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create organization members table with roles
CREATE TABLE IF NOT EXISTS org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'pm', 'lead', 'member', 'guest')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- Create projects table (WD-CLIENT codes)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('discovery', 'design', 'config', 'test', 'deploy', 'complete')),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create artifacts table (uploaded documents)
CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    bucket_path TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES profiles(id),
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create artifact chunks table for vector search
CREATE TABLE IF NOT EXISTS artifact_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding vector(3072),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create summaries table (auto-generated from documents)
CREATE TABLE IF NOT EXISTS summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    risks JSONB,
    decisions JSONB,
    actions JSONB,
    provenance JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create actions tracking table
CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    owner TEXT,
    verb TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
    extracted_from TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create memory entries table (episodic, semantic, procedural, decision, affect)
CREATE TABLE IF NOT EXISTS mem_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('episodic', 'semantic', 'procedural', 'decision', 'affect')),
    content JSONB NOT NULL,
    artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create memory chunks table for RAG
CREATE TABLE IF NOT EXISTS mem_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    mem_entry_id UUID NOT NULL REFERENCES mem_entries(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(3072),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create memory stats table (wellness data aggregation)
CREATE TABLE IF NOT EXISTS mem_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    week_label TEXT NOT NULL,
    very_negative INTEGER DEFAULT 0,
    negative INTEGER DEFAULT 0,
    neutral INTEGER DEFAULT 0,
    positive INTEGER DEFAULT 0,
    very_positive INTEGER DEFAULT 0,
    total_responses INTEGER DEFAULT 0,
    avg_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create memory signals table (wellness alerts)
CREATE TABLE IF NOT EXISTS mem_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    signal_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    message TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_members_org_user ON org_members(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_org_project ON artifacts(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_artifact_chunks_org_project ON artifact_chunks(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_artifact_chunks_embedding ON artifact_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_mem_chunks_org_project ON mem_chunks(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_mem_chunks_embedding ON mem_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_actions_org_project ON actions(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_mem_stats_org_project ON mem_stats(org_id, project_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_project ON audit_log(org_id, project_id);

-- RPC function for searching artifact chunks
CREATE OR REPLACE FUNCTION search_chunks(
    p_org UUID,
    p_project UUID,
    q vector(3072),
    k INTEGER DEFAULT 8
)
RETURNS TABLE (
    content TEXT,
    title TEXT,
    artifact_id UUID,
    similarity FLOAT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT 
        ac.content,
        a.title,
        ac.artifact_id,
        1 - (ac.embedding <=> q) AS similarity
    FROM artifact_chunks ac
    JOIN artifacts a ON ac.artifact_id = a.id
    WHERE ac.org_id = p_org 
    AND ac.project_id = p_project
    ORDER BY ac.embedding <=> q
    LIMIT k;
$$;

-- RPC function for searching memory chunks
CREATE OR REPLACE FUNCTION search_mem_chunks(
    p_org UUID,
    p_project UUID,
    q vector(3072),
    k INTEGER DEFAULT 5
)
RETURNS TABLE (
    content TEXT,
    type TEXT,
    mem_entry_id UUID,
    similarity FLOAT
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT 
        mc.content,
        me.type,
        mc.mem_entry_id,
        1 - (mc.embedding <=> q) AS similarity
    FROM mem_chunks mc
    JOIN mem_entries me ON mc.mem_entry_id = me.id
    WHERE mc.org_id = p_org 
    AND mc.project_id = p_project
    ORDER BY mc.embedding <=> q
    LIMIT k;
$$;

-- Enable Row Level Security (RLS)
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mem_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mem_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mem_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE mem_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orgs
CREATE POLICY "Users can view orgs they belong to" ON orgs
    FOR SELECT USING (
        id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can update orgs" ON orgs
    FOR UPDATE USING (
        id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- RLS Policies for org_members
CREATE POLICY "Users can view org members of their orgs" ON org_members
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can manage org members" ON org_members
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- RLS Policies for projects
CREATE POLICY "Users can view projects in their orgs" ON projects
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "PMs and above can manage projects" ON projects
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin', 'pm')
        )
    );

-- RLS Policies for artifacts
CREATE POLICY "Users can view artifacts in their org projects" ON artifacts
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can upload artifacts to their org projects" ON artifacts
    FOR INSERT WITH CHECK (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for artifact_chunks
CREATE POLICY "Users can view artifact chunks in their org projects" ON artifact_chunks
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for summaries
CREATE POLICY "Users can view summaries in their org projects" ON summaries
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for actions
CREATE POLICY "Users can view actions in their org projects" ON actions
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage actions in their org projects" ON actions
    FOR ALL USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for memory entries and chunks
CREATE POLICY "Users can view memories in their org projects" ON mem_entries
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view memory chunks in their org projects" ON mem_chunks
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for wellness data (PM/Exec only for viewing, anonymous for submission)
CREATE POLICY "PMs and executives can view wellness stats" ON mem_stats
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin', 'pm')
        )
    );

CREATE POLICY "Anyone in org can submit wellness data" ON mem_stats
    FOR INSERT WITH CHECK (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "PMs and executives can view wellness signals" ON mem_signals
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin', 'pm')
        )
    );

-- RLS Policies for audit log
CREATE POLICY "Admins and owners can view audit logs" ON audit_log
    FOR SELECT USING (
        org_id IN (
            SELECT org_id FROM org_members 
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Enable realtime for notifications (optional)
-- ALTER PUBLICATION supabase_realtime ADD TABLE mem_signals;
-- ALTER PUBLICATION supabase_realtime ADD TABLE actions;
